// scripts/checar-pedidos.js
//
// Roda periodicamente via GitHub Actions (veja .github/workflows/notificar-pedidos.yml).
// Verifica se existem pedidos novos (fila ou reserva) em "sifriyah_pedidos_fila" que ainda
// não foram avisados, e manda uma mensagem no Telegram pra cada um. Usa a Firebase Admin SDK
// (chave de serviço), que ignora as regras de segurança do Firestore — por isso não precisa
// de nenhuma mudança nas regras pra isso funcionar.
//
// Variáveis de ambiente esperadas (vêm dos GitHub Secrets):
//   FIREBASE_SERVICE_ACCOUNT  -> conteúdo JSON completo da chave de serviço do Firebase
//   TELEGRAM_BOT_TOKEN        -> token do bot, dado pelo @BotFather
//   TELEGRAM_CHAT_ID          -> chat_id de quem deve receber os avisos
//   SIFRIYAH_DOC_ID           -> código da biblioteca (opcional, padrão "principal")

const admin = require("firebase-admin");

const DOC_ID = process.env.SIFRIYAH_DOC_ID || "principal";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function precisaVar(nome, valor) {
  if (!valor) {
    console.error(`Faltando variável de ambiente: ${nome}`);
    process.exit(1);
  }
}
precisaVar("FIREBASE_SERVICE_ACCOUNT", process.env.FIREBASE_SERVICE_ACCOUNT);
precisaVar("TELEGRAM_BOT_TOKEN", TELEGRAM_TOKEN);
precisaVar("TELEGRAM_CHAT_ID", TELEGRAM_CHAT_ID);

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function enviarTelegram(texto) {
  const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texto }),
  });
  if (!resp.ok) {
    const corpo = await resp.text();
    throw new Error(`Telegram respondeu ${resp.status}: ${corpo}`);
  }
}

function montarMensagem(pf) {
  const tipo = pf.tipo === "reserva" ? "📖 Nova reserva" : "⏳ Novo pedido de fila";
  const livro = pf.tituloLivro || "(livro)";
  const quem = pf.codigoUsuario
    ? `código ${pf.codigoUsuario}`
    : [pf.nome, pf.sobrenome].filter(Boolean).join(" ") + (pf.telefone ? ` · ${pf.telefone}` : "");
  return `${tipo}\n${livro}\n${quem || "(sem identificação)"}`;
}

async function main() {
  // "sifriyah_notificacoes/{docId}" guarda só um relógio: o criadoEm do último pedido
  // já avisado, pra essa checagem nunca mandar a mesma notificação duas vezes
  const estadoRef = db.collection("sifriyah_notificacoes").doc(DOC_ID);
  const estadoSnap = await estadoRef.get();
  const ultimoAvisoEm = estadoSnap.exists ? estadoSnap.data().ultimoAvisoEm || 0 : 0;

  const snap = await db
    .collection("sifriyah_pedidos_fila")
    .where("biblioteca", "==", DOC_ID)
    .where("atendido", "==", false)
    .where("criadoEm", ">", ultimoAvisoEm)
    .orderBy("criadoEm", "asc")
    .get();

  if (snap.empty) {
    console.log("Nenhum pedido novo.");
    return;
  }

  let maiorCriadoEm = ultimoAvisoEm;
  for (const doc of snap.docs) {
    const pf = doc.data();
    maiorCriadoEm = Math.max(maiorCriadoEm, pf.criadoEm || 0);
    await enviarTelegram(montarMensagem(pf));
    console.log(`Avisado: ${doc.id}`);
  }

  await estadoRef.set({ ultimoAvisoEm: maiorCriadoEm }, { merge: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
