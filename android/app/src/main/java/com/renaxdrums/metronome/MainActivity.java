package com.renaxdrums.metronome;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.*;
import android.view.WindowManager;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Toast;
import android.widget.FrameLayout;
import java.io.*;
import java.util.*;
import org.json.JSONObject;

/** Local HTTPS asset origin; no file:// access and no JavascriptInterface. */
public final class MainActivity extends Activity {
  private static final String ORIGIN="https://appassets.androidplatform.net";
  private static final String SITE="https://renaxdrums.github.io/metronome/";
  private static final int OPEN_FILE=10,SAVE_FILE=11,MAX_EXPORT=20*1024*1024;
  private WebView web;
  private ValueCallback<Uri[]> fileCallback;
  private byte[] pendingExport;
  private WebMessagePort nativePort;

  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    getWindow().setStatusBarColor(Color.rgb(28,33,39));
    getWindow().setNavigationBarColor(Color.rgb(28,33,39));
    web=new WebView(this);web.setBackgroundColor(Color.rgb(28,33,39));
    FrameLayout root=new FrameLayout(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));
    root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener(){@Override public WindowInsets onApplyWindowInsets(View view,WindowInsets insets){view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;}});
    setContentView(root);
    WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
    s.setAllowFileAccess(false);s.setAllowContentAccess(true);
    s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(true);s.setSupportMultipleWindows(false);
    WebView.setWebContentsDebuggingEnabled(false);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
    web.setWebViewClient(new WebViewClient(){
      @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
        Uri u=r.getUrl();String host=u.getHost();
        if(!"https".equals(u.getScheme()))return denied();
        if("appassets.androidplatform.net".equals(host))return asset(u);
        if(!allowedHost(host))return denied();
        return null;
      }
      @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
        Uri u=r.getUrl();
        if((ORIGIN+"/open-website").equals(u.toString())){openSite();return true;}
        if(r.isForMainFrame()&&!(ORIGIN+"/app/index.html").equals(u.toString())){
          if(r.hasGesture()&&"https".equals(u.getScheme()))openExternal(u);
          return true;
        }
        return !"https".equals(u.getScheme());
      }
      @Override public void onPageFinished(WebView v,String url){if((ORIGIN+"/app/index.html").equals(url))installPort();}
    });
    web.setWebChromeClient(new WebChromeClient(){
      @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
        if(!(ORIGIN+"/app/index.html").equals(v.getUrl()))return false;
        if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("*/*");pick.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","audio/*"});
        try{startActivityForResult(pick,OPEN_FILE);}catch(Exception error){fileCallback.onReceiveValue(null);fileCallback=null;}
        return true;
      }
    });
    web.setDownloadListener(new DownloadListener(){@Override public void onDownloadStart(String url,String agent,String disposition,String mime,long length){
      if(url.startsWith("https://")&&allowedHost(Uri.parse(url).getHost()))openExternal(Uri.parse(url));
    }});
    web.loadUrl(ORIGIN+"/app/index.html");
  }
  private boolean allowedHost(String h){
    return h!=null&&(h.equals("cdn.jsdelivr.net")||h.equals("fonts.googleapis.com")||h.equals("fonts.gstatic.com")||h.equals("huggingface.co")||h.endsWith(".huggingface.co")||h.endsWith(".hf.co"));
  }
  private WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  private WebResourceResponse asset(Uri uri){
    String p=uri.getPath();
    if(p==null||!p.startsWith("/app/")||p.contains("..")||p.indexOf('\\')>=0||p.indexOf('\0')>=0)return denied();
    String file=p.substring(5);if(file.isEmpty())file="index.html";
    try{
      InputStream input=getAssets().open("site/"+file);
      String mime=URLConnectionMime(file);Map<String,String> headers=new HashMap<>();
      headers.put("X-Content-Type-Options","nosniff");headers.put("Cache-Control","no-cache");
      return new WebResourceResponse(mime,mime.startsWith("text/")||mime.contains("javascript")||mime.contains("json")?"UTF-8":null,200,"OK",headers,input);
    }catch(IOException error){return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
  }
  private String URLConnectionMime(String file){
    if(file.endsWith(".js")||file.endsWith(".mjs"))return "text/javascript";
    if(file.endsWith(".css"))return "text/css";if(file.endsWith(".html"))return "text/html";
    if(file.endsWith(".json")||file.endsWith(".webmanifest"))return "application/json";
    if(file.endsWith(".svg"))return "image/svg+xml";if(file.endsWith(".wasm"))return "application/wasm";
    if(file.endsWith(".wav"))return "audio/wav";if(file.endsWith(".mp3"))return "audio/mpeg";
    if(file.endsWith(".woff2"))return "font/woff2";if(file.endsWith(".woff"))return "font/woff";
    String mime=java.net.URLConnection.guessContentTypeFromName(file);return mime==null?"application/octet-stream":mime;
  }
  private void installPort(){
    if(nativePort!=null)nativePort.close();
    final String nonce=UUID.randomUUID().toString();WebMessagePort[] ports=web.createWebMessageChannel();nativePort=ports[0];
    nativePort.setWebMessageCallback(new WebMessagePort.WebMessageCallback(){@Override public void onMessage(WebMessagePort port,WebMessage message){
      try{
        if(!(ORIGIN+"/app/index.html").equals(web.getUrl())||pendingExport!=null)return;
        String raw=message.getData();if(raw==null||raw.length()>MAX_EXPORT*4/3+4096)return;
        JSONObject data=new JSONObject(raw);String mime=data.optString("mime"),name=data.optString("name");
        if(!Arrays.asList("application/json","audio/mpeg","audio/wav","audio/mp3","audio/midi").contains(mime))return;
        byte[] bytes=Base64.decode(data.getString("data"),Base64.DEFAULT);if(bytes.length>MAX_EXPORT)return;
        pendingExport=bytes;name=name.replaceAll("[\\\\/\\p{Cntrl}]","_");if(name.length()>120)name=name.substring(0,120);
        Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType(mime);save.putExtra(Intent.EXTRA_TITLE,name);
        startActivityForResult(save,SAVE_FILE);
      }catch(Exception error){pendingExport=null;Toast.makeText(MainActivity.this,"Export impossible",Toast.LENGTH_SHORT).show();}
    }});
    String script="(function(){let port;window.addEventListener('message',function(e){if(e.data==='renax-native:"+nonce+"'&&e.ports.length)port=e.ports[0];});function save(a){if(!a.download||!a.href.startsWith('blob:'))return false;if(!port){alert('Export indisponible, réessaie.');return true;}fetch(a.href).then(r=>r.blob()).then(blob=>{if(blob.size>"+MAX_EXPORT+"){alert('Export trop volumineux (20 Mo maximum).');return;}const reader=new FileReader();reader.onload=()=>port.postMessage(JSON.stringify({name:a.download,mime:blob.type||'application/json',data:String(reader.result).split(',')[1]}));reader.readAsDataURL(blob);}).catch(()=>alert('Export impossible.'));return true;}const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!save(this))return click.call(this);};document.addEventListener('click',function(e){const account=e.target.closest('#directAccountBtn');if(account){e.preventDefault();e.stopImmediatePropagation();location.href='"+ORIGIN+"/open-website';return;}const a=e.target.closest('a[download]');if(a&&save(a)){e.preventDefault();e.stopImmediatePropagation();}},true);})();";
    web.evaluateJavascript(script,new ValueCallback<String>(){@Override public void onReceiveValue(String ignored){web.postWebMessage(new WebMessage("renax-native:"+nonce,new WebMessagePort[]{ports[1]}),Uri.parse(ORIGIN));}});
  }
  private void openSite(){openExternal(Uri.parse(SITE));}
  private void openExternal(Uri uri){try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}}
  @Override protected void onActivityResult(int request,int result,Intent data){
    super.onActivityResult(request,result,data);
    if(request==OPEN_FILE&&fileCallback!=null){Uri uri=data==null?null:data.getData();fileCallback.onReceiveValue(result==RESULT_OK&&uri!=null&&"content".equals(uri.getScheme())?new Uri[]{uri}:null);fileCallback=null;}
    if(request==SAVE_FILE){try{if(result==RESULT_OK&&data!=null&&data.getData()!=null&&"content".equals(data.getData().getScheme())&&pendingExport!=null)try(OutputStream output=getContentResolver().openOutputStream(data.getData())){if(output!=null)output.write(pendingExport);}}catch(Exception error){Toast.makeText(this,"Enregistrement impossible",Toast.LENGTH_SHORT).show();}finally{pendingExport=null;}}
  }
  @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
  @Override protected void onPause(){web.evaluateJavascript("if(typeof isPlaying!=='undefined'&&isPlaying&&typeof stopMetronome==='function')stopMetronome();",null);web.onPause();super.onPause();}
  @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
  @Override protected void onDestroy(){if(fileCallback!=null)fileCallback.onReceiveValue(null);if(nativePort!=null)nativePort.close();web.destroy();super.onDestroy();}
}
