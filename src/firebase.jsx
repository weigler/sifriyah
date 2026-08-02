// ---- Sincronização em nuvem (Firebase Firestore) — opcional ----
const CLOUD_CONFIG_KEY = "sifriyah-cloud-config"; // fica salvo local em cada aparelho (não é segredo)
const ADMIN_EMAIL_KEY = "sifriyah-admin-email"; // só o e-mail, nunca a senha, pra mostrar "logado como..." sem esperar o Firebase responder
let _fbApp = null;
let _fbDb = null;
let _fbAuth = null;

function lerConfigNuvem() {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function salvarConfigNuvem(cfg) {
  if (cfg) localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CLOUD_CONFIG_KEY);
}

// ---- Modo "sem senha" (opcional) ----
// Quando ativado, os dados continuam tecnicamente criptografados (pra não mudar o formato de
// armazenamento), mas com uma frase-senha FIXA e pública — ela está aqui, no código-fonte aberto
// do app. Ou seja: isso NÃO protege os dados de quem tiver acesso ao Firestore, só evita o
// aparelho pedir senha pra abrir. Ver conversa sobre isso nos Ajustes do app.
const SEM_SENHA_PASSPHRASE = "sifriyah-modo-sem-senha-nao-e-secreta";
const SEM_SENHA_LOCAL_KEY = "sifriyah-sem-senha";
function lerSemSenhaLocal() {
  return localStorage.getItem(SEM_SENHA_LOCAL_KEY) === "1";
}
function salvarSemSenhaLocal(ativo) {
  if (ativo) localStorage.setItem(SEM_SENHA_LOCAL_KEY, "1");
  else localStorage.removeItem(SEM_SENHA_LOCAL_KEY);
}

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// aceita colar "const firebaseConfig = {...};" ou só o objeto {...}
function parseFirebaseConfigColado(texto) {
  const limpo = texto.replace(/const\s+firebaseConfig\s*=\s*/, "").replace(/;\s*$/, "");
  const obj = new Function("return (" + limpo + ")")();
  if (!obj.apiKey || !obj.projectId) throw new Error("faltam campos");
  return obj;
}

async function inicializarFirebase(firebaseConfig) {
  if (_fbDb) return _fbDb;
  await carregarScript("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
  await carregarScript("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js");
  await carregarScript("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js");
  // eslint-disable-next-line no-undef
  _fbApp = firebase.initializeApp(firebaseConfig);
  // eslint-disable-next-line no-undef
  _fbDb = firebase.firestore();
  // eslint-disable-next-line no-undef
  _fbAuth = firebase.auth();
  return _fbDb;
}

// login de administrador (Firebase Authentication) — é diferente da senha do app:
// essa senha aqui é o que o Firestore reconhece pra liberar acesso de admin nas regras;
// a senha do app continua sendo só a chave de criptografia dos dados
async function obterFirebaseAuth(firebaseConfig) {
  await inicializarFirebase(firebaseConfig);
  return _fbAuth;
}
// espera a sessão do Firebase Auth terminar de restaurar (localStorage/indexedDB) antes de
// deixar o app ler o Firestore — sem isso, a primeira leitura após um refresh pode disparar
// antes do login persistido "voltar", cair em permission-denied nas regras, e o app achar
// (errado) que a biblioteca está vazia
async function aguardarAuthPronto(firebaseConfig) {
  const auth = await obterFirebaseAuth(firebaseConfig);
  return new Promise((resolve) => {
    const cancelar = auth.onAuthStateChanged((user) => {
      cancelar();
      resolve(user);
    });
  });
}
async function entrarComoAdminNuvem(firebaseConfig, email, senha) {
  const auth = await obterFirebaseAuth(firebaseConfig);
  const cred = await auth.signInWithEmailAndPassword(email, senha);
  return cred.user;
}
async function sairComoAdminNuvem(firebaseConfig) {
  const auth = await obterFirebaseAuth(firebaseConfig);
  await auth.signOut();
}

// seções em que os dados são divididos — cada uma é salva e sincronizada separadamente,
// pra dois aparelhos não sobrescreverem um o dado do outro (só "brigam" se mexerem na mesma seção)
const SECOES = ["acervo", "pessoas", "emprestimos", "ajustes"];
const LABEL_SECAO = { acervo: "Acervo", pessoas: "Pessoas", emprestimos: "Empréstimos", ajustes: "Ajustes" };
const NIVEIS_LEITURA = ["Infantil", "Juvenil", "Iniciante", "Intermediário", "Avançado", "Acadêmico"];
const MAX_BACKUPS_AUTOMATICOS_PADRAO = 10;
const BACKUP_LOCAL_KEY = "sifriyah-backups-local";

async function nuvemLerDoc(firebaseConfig, docId) {
  const db = await inicializarFirebase(firebaseConfig);
  const snap = await db.collection("sifriyah").doc(docId).get();
  return snap.exists ? snap.data() : null;
}

// grava só a seção que mudou (merge), sem tocar nas outras — é isso que evita
// que dois aparelhos editando partes diferentes se sobrescrevam
async function nuvemSalvarSecao(firebaseConfig, docId, secao, blob, atualizadoEm) {
  const db = await inicializarFirebase(firebaseConfig);
  await db
    .collection("sifriyah")
    .doc(docId)
    .set({ [secao]: { blob, atualizadoEm } }, { merge: true });
}

// escuta o documento inteiro, mas repassa cada seção separadamente pra quem está ouvindo decidir
// se aquilo já foi aplicado (evita reprocessar o eco do próprio salvamento)
function nuvemOuvir(firebaseConfig, docId, onMudancaSecao) {
  inicializarFirebase(firebaseConfig).then((db) => {
    db.collection("sifriyah")
      .doc(docId)
      .onSnapshot((snap) => {
        if (!snap.exists) return;
        const dados = snap.data();
        SECOES.forEach((secao) => {
          if (dados[secao]) onMudancaSecao(secao, dados[secao]);
        });
      });
  });
  return () => {};
}

// salva uma cópia PÚBLICA (sem senha, sem dados sensíveis) só com título/autor/disponibilidade
async function nuvemSalvarPublico(firebaseConfig, docId, dadosPublicos) {
  const db = await inicializarFirebase(firebaseConfig);
  await db
    .collection("sifriyah_publico")
    .doc(docId)
    .set({ ...dadosPublicos, atualizadoEm: Date.now() });
}

// pré-cadastros enviados pela vitrine pública (sem senha)
function nuvemOuvirPreCadastros(firebaseConfig, docId, onChange) {
  inicializarFirebase(firebaseConfig).then((db) => {
    db.collection("sifriyah_precadastros")
      .where("biblioteca", "==", docId)
      .onSnapshot((snap) => {
        const lista = [];
        snap.forEach((doc) => lista.push({ id: doc.id, ...doc.data() }));
        // só mostra os que ainda não foram aceitos — os aceitos ficam guardados
        // por um tempo (rede de segurança), mas somem da lista de revisão
        const pendentes = lista.filter((pc) => !pc.aceito);
        pendentes.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
        onChange(pendentes);
      });
  });
}
async function nuvemRemoverPreCadastro(firebaseConfig, id) {
  const db = await inicializarFirebase(firebaseConfig);
  await db.collection("sifriyah_precadastros").doc(id).delete();
}
// em vez de apagar na hora, marca como aceito — assim fica guardado como histórico/comprovante
// por um tempo, caso precise conferir depois, mas some da lista de pendentes pra revisar
async function nuvemMarcarAceitoPreCadastro(firebaseConfig, id) {
  const db = await inicializarFirebase(firebaseConfig);
  await db.collection("sifriyah_precadastros").doc(id).update({ aceito: true, aceitoEm: Date.now() });
}
const DIAS_GUARDAR_PRECADASTRO_ACEITO = 60;
// limpa pré-cadastros já aceitos há mais de 60 dias — chamado uma vez por sessão
async function nuvemLimparPreCadastrosAntigos(firebaseConfig, docId) {
  const db = await inicializarFirebase(firebaseConfig);
  const snap = await db
    .collection("sifriyah_precadastros")
    .where("biblioteca", "==", docId)
    .where("aceito", "==", true)
    .get();
  const limite = Date.now() - DIAS_GUARDAR_PRECADASTRO_ACEITO * 24 * 60 * 60 * 1000;
  const paraApagar = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.aceitoEm && d.aceitoEm < limite) paraApagar.push(doc.ref);
  });
  if (paraApagar.length === 0) return;
  const batch = db.batch();
  paraApagar.forEach((ref) => batch.delete(ref));
  await batch.commit();
}

// pedidos de "entrar na fila" enviados pela vitrine pública (sem senha) — vêm com código de
// usuário (se a pessoa já tiver um) ou nome+telefone (se ainda não tiver se cadastrado)
function nuvemOuvirPedidosFila(firebaseConfig, docId, onChange) {
  inicializarFirebase(firebaseConfig).then((db) => {
    db.collection("sifriyah_pedidos_fila")
      .where("biblioteca", "==", docId)
      .onSnapshot((snap) => {
        const lista = [];
        snap.forEach((doc) => lista.push({ id: doc.id, ...doc.data() }));
        // só mostra os que ainda não foram atendidos — os atendidos ficam guardados
        // por um tempo (rede de segurança), mas somem da lista de revisão
        const pendentes = lista.filter((pf) => !pf.atendido);
        pendentes.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
        onChange(pendentes);
      });
  });
}
async function nuvemRemoverPedidoFila(firebaseConfig, id) {
  const db = await inicializarFirebase(firebaseConfig);
  await db.collection("sifriyah_pedidos_fila").doc(id).delete();
}
// em vez de apagar na hora, marca como atendido — fica guardado como histórico por um tempo
async function nuvemMarcarAtendidoPedidoFila(firebaseConfig, id) {
  const db = await inicializarFirebase(firebaseConfig);
  await db.collection("sifriyah_pedidos_fila").doc(id).update({ atendido: true, atendidoEm: Date.now() });
}
const DIAS_GUARDAR_PEDIDO_FILA_ATENDIDO = 60;
// limpa pedidos de fila já atendidos há mais de 60 dias — chamado uma vez por sessão
async function nuvemLimparPedidosFilaAntigos(firebaseConfig, docId) {
  const db = await inicializarFirebase(firebaseConfig);
  const snap = await db
    .collection("sifriyah_pedidos_fila")
    .where("biblioteca", "==", docId)
    .where("atendido", "==", true)
    .get();
  const limite = Date.now() - DIAS_GUARDAR_PEDIDO_FILA_ATENDIDO * 24 * 60 * 60 * 1000;
  const paraApagar = [];
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.atendidoEm && d.atendidoEm < limite) paraApagar.push(doc.ref);
  });
  if (paraApagar.length === 0) return;
  const batch = db.batch();
  paraApagar.forEach((ref) => batch.delete(ref));
  await batch.commit();
}

// ---- Backups (cópias completas com data/hora, separadas do salvamento "ao vivo") ----
async function nuvemSalvarBackup(firebaseConfig, docId, tipo, secoesBlobs, criadoEm) {
  const db = await inicializarFirebase(firebaseConfig);
  await db.collection("sifriyah_backups").add({ biblioteca: docId, tipo, criadoEm, secoes: secoesBlobs });
}
async function nuvemListarBackups(firebaseConfig, docId) {
  const db = await inicializarFirebase(firebaseConfig);
  const snap = await db.collection("sifriyah_backups").where("biblioteca", "==", docId).get();
  const lista = [];
  snap.forEach((doc) => lista.push({ id: doc.id, ...doc.data() }));
  lista.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  return lista;
}
async function nuvemApagarBackup(firebaseConfig, id) {
  const db = await inicializarFirebase(firebaseConfig);
  await db.collection("sifriyah_backups").doc(id).delete();
}

async function localListarBackups() {
  const res = await window.storage.get(BACKUP_LOCAL_KEY, false).catch(() => null);
  if (!res || !res.value) return [];
  try {
    return JSON.parse(res.value);
  } catch (e) {
    return [];
  }
}
async function localSalvarListaBackups(lista) {
  await window.storage.set(BACKUP_LOCAL_KEY, JSON.stringify(lista), false);
}

// distingue "sem permissão" (precisa logar como admin) de outros erros de rede/nuvem
