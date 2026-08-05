// ---------------- Configuração do Firebase (embutida no código-fonte) ----------------
// Isso NÃO é segredo: a apiKey de um app Firebase Web é pública por natureza — ela aparece
// no código-fonte de qualquer site que use Firebase (dá pra ver isso até em catalogo/index.html,
// que já usa exatamente essa configuração há tempos). Quem protege os dados de verdade é:
//   1) as regras do Firestore (o que cada coleção permite ler/escrever);
//   2) o login de administrador (e-mail/senha, via Firebase Authentication);
//   3) a criptografia dos dados com a senha do app (PBKDF2 + AES-GCM).
// Com esse arquivo aqui, um aparelho novo não precisa mais colar a configuração na mão —
// o app já sabe se conectar à nuvem sozinho; só falta fazer login de administrador.
// Mesmo modelo usado no projeto WTG Quizzing (shared/firebase-config.js).
const FIREBASE_CONFIG_PADRAO = {
  apiKey: "AIzaSyA8NS9oK6BZdv7EcHxOvY7UyTgto6voIvA",
  authDomain: "sifriyah.firebaseapp.com",
  projectId: "sifriyah",
  storageBucket: "sifriyah.firebasestorage.app",
  messagingSenderId: "54128425070",
  appId: "1:54128425070:web:8d1d198d375d63593b0e7f",
};

// código da biblioteca padrão (o mesmo já usado em catalogo/index.html). Pode ser trocado por
// aparelho em Ajustes > Sincronização — útil se um dia este projeto Firebase hospedar mais
// de uma biblioteca ao mesmo tempo (ex.: preparo pro IPN Books).
const DOC_ID_PADRAO = "principal";
