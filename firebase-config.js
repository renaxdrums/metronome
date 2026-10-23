/* Public configuration only. No administrative key or OAuth secret belongs here. */
export const firebaseConfig={
  apiKey:'AIzaSyDRY7LRVEhaKoJyzZpDCvpkSb10oiTfGFM',
  authDomain:'renax-metronome.firebaseapp.com',
  projectId:'renax-metronome',
  storageBucket:'renax-metronome.firebasestorage.app',
  messagingSenderId:'28917169589',
  appId:'1:28917169589:web:2d916e8845eca691d32dfc'
};
export const providers={email:true,google:true};
export const appCheckSiteKey='6Ld-2vwtAAAAAOlN7FtOx-xg3_QHTQmrzH1FpQPl';
// The compatible client can be released before the mandatory server rules.
export const cloudWriteBudgetEnabled=true;
export const emulator=null; // Test-only: {host:'127.0.0.1',authPort:9099,firestorePort:8080}
