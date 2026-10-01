import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// 1. ການຕັ້ງຄ່າ Firebase Credentials ຂອງໂຄງການ Le Ouve Workspace
const firebaseConfig = {
  apiKey: "AIzaSyCsa2upr5N2Q3aJaog8IObWNbfXJTZLLdM",
  authDomain: "le-ouve-workspace.firebaseapp.com",
  projectId: "le-ouve-workspace",
  storageBucket: "le-ouve-workspace.firebasestorage.app",
  messagingSenderId: "451813145095",
  appId: "1:451813145095:web:dfd6eae75b25d5d521c8a2",
  measurementId: "G-C156QHK4V7"
};

// 2. Initialize Firebase (ປ້ອງກັນການສ້າງ Instance ຊ້ຳຊ້ອນຕອນ Re-render)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 3. Export Auth & Firestore ສຳລັບເອີ້ນໃຊ້ໃນ Components ທັງໝົດ
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// 4. Enum ສຳລັບປະເພດການດຳເນີນງານຖານຂໍ້ມູນ
export enum OperationType {
  CREATE = 'CREATE',
  READ = 'READ',
  WRITE = 'WRITE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LIST = 'LIST'
}

// 5. Function ຈັດການ Error ເວລາອ່ານ-ຂຽນຂໍ້ມູນ Firestore
export function handleFirestoreError(
  error: any,
  operation: OperationType,
  collectionName: string
) {
  console.error(`[Firestore Error - ${operation} on ${collectionName}]:`, error);

  if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
    console.warn(
      `Permission Denied: ບໍ່ມີສິດເຂົ້າເຖິງ collection '${collectionName}'. ກະລຸນາກວດສອບ Security Rules ໃນ Firebase Console.`
    );
  } else if (error?.code === 'failed-precondition' || error?.message?.includes('index')) {
    console.warn(
      `Missing Index: ຄຳສັ່ງ Query ໃນ '${collectionName}' ຕ້ອງການ Index. ກົດລິ້ງໃນ console ເພື່ອສ້າງ.`
    );
  }
}

export default app;
