package com.renaxdrums.metronome.qa;

import android.app.Activity;
import android.app.Instrumentation;
import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;
import org.json.*;

/** Separate test APK. Never included in the application distributed to users. */
public final class Probe extends Instrumentation {
  private volatile Activity activity;
  private volatile WebView web;
  private boolean done;
  @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
  private WebView find(View view) {
    if (view instanceof WebView) return (WebView)view;
    if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) {
      WebView found=find(((ViewGroup)view).getChildAt(i)); if(found!=null)return found;
    }
    return null;
  }
  private Intent intent() {
    return new Intent().setClassName("com.renaxdrums.metronome","com.renaxdrums.metronome.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
  }
  private void bind(Activity current) {
    if(current.getClass().getName().equals("com.renaxdrums.metronome.MainActivity")) {
      activity=current;web=find(current.getWindow().getDecorView());
    }
  }
  @Override public void callActivityOnCreate(Activity current,Bundle state) {
    super.callActivityOnCreate(current,state);bind(current);
  }
  @Override public void callActivityOnResume(Activity current) {
    super.callActivityOnResume(current);bind(current);
  }
  @Override public void callActivityOnDestroy(Activity current) {
    if(current==activity)web=null;
    super.callActivityOnDestroy(current);
  }
  private void launch() {
    startActivitySync(intent());
    if(web==null)throw new IllegalStateException("Target activity has no WebView");
  }
  private Object evaluate(String script) throws Exception {
    long deadline=SystemClock.uptimeMillis()+25000;
    while(SystemClock.uptimeMillis()<deadline) {
      final WebView target=web;
      if(target==null){SystemClock.sleep(50);continue;}
      final String[] value=new String[1];final CountDownLatch latch=new CountDownLatch(1);
      runOnMainSync(()->{
        if(target!=web||activity.isDestroyed()){latch.countDown();return;}
        target.evaluateJavascript(script,result->{value[0]=result;latch.countDown();});
      });
      while(SystemClock.uptimeMillis()<deadline&&target==web&&!latch.await(100,TimeUnit.MILLISECONDS)){}
      if(target!=web)continue;
      if(latch.getCount()!=0)break;
      return value[0]==null?JSONObject.NULL:new JSONTokener(value[0]).nextValue();
    }
    throw new TimeoutException("WebView JavaScript callback timed out");
  }
  private void pointer(int x,int y) {
    long t=SystemClock.uptimeMillis();
    MotionEvent down=MotionEvent.obtain(t,t,MotionEvent.ACTION_DOWN,x,y,0);
    MotionEvent up=MotionEvent.obtain(t,t+60,MotionEvent.ACTION_UP,x,y,0);
    try {
      if(!getUiAutomation().injectInputEvent(down,true))throw new IllegalStateException("Pointer down rejected");
      SystemClock.sleep(60);
      if(!getUiAutomation().injectInputEvent(up,true))throw new IllegalStateException("Pointer up rejected");
    } finally { down.recycle();up.recycle(); }
  }
  private void nodes(AccessibilityNodeInfo node,JSONArray list,int depth) throws Exception {
    if(node==null||depth>40||list.length()>2000)return;
    if(node.isVisibleToUser()) {
      Rect r=new Rect();node.getBoundsInScreen(r);
      list.put(new JSONObject().put("package",String.valueOf(node.getPackageName())).put("text",String.valueOf(node.getText())).put("desc",String.valueOf(node.getContentDescription())).put("id",String.valueOf(node.getViewIdResourceName())).put("class",String.valueOf(node.getClassName())).put("clickable",node.isClickable()).put("x",r.centerX()).put("y",r.centerY()).put("w",r.width()).put("h",r.height()));
    }
    for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo child=node.getChild(i);try{nodes(child,list,depth+1);}finally{if(child!=null)child.recycle();}}
  }
  private Object command(JSONObject q) throws Exception {
    String action=q.getString("action");
    if(action.equals("eval"))return evaluate(q.getString("script"));
    if(action.equals("tap")){pointer(q.getInt("x"),q.getInt("y"));return true;}
    if(action.equals("tapCss")) {
      String selector=JSONObject.quote(q.getString("selector"));
      String expression="JSON.stringify((()=>{const e=document.querySelector("+selector+");if(!e)throw Error('Missing touch target');e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:r.height}})())";
      Object encoded=evaluate(expression);
      if(!(encoded instanceof String))throw new IllegalStateException("Touch target unavailable");
      JSONObject r=new JSONObject((String)encoded);if(r.getDouble("h")<=0)throw new IllegalStateException("Touch target is hidden");
      int[] location=new int[2];runOnMainSync(()->web.getLocationOnScreen(location));
      double scale=web.getWidth()/r.getDouble("w");
      pointer(location[0]+(int)Math.round(r.getDouble("x")*scale),location[1]+(int)Math.round(r.getDouble("y")*scale));
      return true;
    }
    if(action.equals("nodes")){JSONArray list=new JSONArray();nodes(getUiAutomation().getRootInActiveWindow(),list,0);return list;}
    if(action.equals("rotate")){int orientation=q.getBoolean("landscape")?ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE:ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;runOnMainSync(()->activity.setRequestedOrientation(orientation));return true;}
    if(action.equals("home"))return getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME);
    if(action.equals("resume")){runOnMainSync(()->activity.startActivity(intent().addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));return true;}
    if(action.equals("relaunch")){runOnMainSync(()->activity.finish());launch();return true;}
    if(action.equals("finish")){done=true;return true;}
    throw new IllegalArgumentException("Unknown QA action");
  }
  @Override public void onStart() {
    Bundle result=new Bundle();
    try (ServerSocket server=new ServerSocket()) {
      server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),8765));
      launch();
      while(!done)try(Socket socket=server.accept()) {
        socket.setSoTimeout(40000);
        BufferedReader reader=new BufferedReader(new InputStreamReader(socket.getInputStream(),"UTF-8"));
        String line=reader.readLine();JSONObject response=new JSONObject();
        try {response.put("value",command(new JSONObject(line)));}catch(Exception e){response.put("error",e.toString());}
        Writer writer=new OutputStreamWriter(socket.getOutputStream(),"UTF-8");writer.write(response.toString()+"\n");writer.flush();
      }
      result.putString("stream","Native QA probe finished\n");finish(Activity.RESULT_OK,result);
    } catch(Exception e){result.putString("stream",e.toString()+"\n");finish(Activity.RESULT_CANCELED,result);}
  }
}
