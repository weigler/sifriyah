// scripts/checar-pedidos.js
//
// Roda periodicamente via GitHub Actions (veja .github/workflows/notificar-pedidos.yml).
// Verifica se existem pedidos novos (fila, reserva ou sugestão de livro) em
// "sifriyah_pedidos_fila" que ainda não foram avisados, resolve o código de usuário pro
// nome/telefone reais, e manda uma mensagem no Telegram pra cada um. Usa a Firebase Admin SDK (chave de serviço), que ignora
// as regras de segurança do Firestore — por isso não precisa de nenhuma mudança nas regras
// pra isso funcionar.
//
// Variáveis de ambiente esperadas (vêm dos GitHub Secrets):
//   FIREBASE_SERVICE_ACCOUNT  -> conteúdo JSON completo da chave de serviço do Firebase
//   TELEGRAM_BOT_TOKEN        -> token do bot, dado pelo @BotFather
//   TELEGRAM_CHAT_ID          -> chat_id de quem deve receber os avisos
//   SIFRIYAH_APP_PASSWORD     -> a mesma senha local usada pra destrancar o app — usada só
//                                pra decifrar os nomes/telefones das pessoas, aqui no script
//   SIFRIYAH_DOC_ID           -> código da biblioteca (opcional, padrão "principal")

const admin = require("firebase-admin");
const crypto = require("crypto");

const DOC_ID = process.env.SIFRIYAH_DOC_ID || "principal";
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APP_PASSWORD = process.env.SIFRIYAH_APP_PASSWORD;

function precisaVar(nome, valor) {
  if (!valor) {
    console.error(`Faltando variável de ambiente: ${nome}`);
    process.exit(1);
  }
}
precisaVar("FIREBASE_SERVICE_ACCOUNT", process.env.FIREBASE_SERVICE_ACCOUNT);
precisaVar("TELEGRAM_BOT_TOKEN", TELEGRAM_TOKEN);
precisaVar("TELEGRAM_CHAT_ID", TELEGRAM_CHAT_ID);
precisaVar("SIFRIYAH_APP_PASSWORD", APP_PASSWORD);

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ---- mesma criptografia usada no app (PBKDF2-SHA256 150k iterações + AES-256-GCM), só que
// com a API nativa de crypto do Node em vez da Web Crypto do navegador ----
function decryptJSON(raw, password) {
  const payload = JSON.parse(raw);
  const salt = Buffer.from(payload.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const dataFull = Buffer.from(payload.data, "base64");
  // a Web Crypto do navegador junta o auth tag (16 bytes) no final do ciphertext — o Node
  // exige eles separados, então precisa dividir aqui antes de decifrar
  const tag = dataFull.subarray(dataFull.length - 16);
  const ciphertext = dataFull.subarray(0, dataFull.length - 16);
  const key = crypto.pbkdf2Sync(password, salt, 150000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

// busca e decifra a seção "pessoas", devolvendo um mapa código-de-usuário -> pessoa. Se algo
// der errado (senha errada, seção ainda não existe, etc.) devolve null e o script continua
// funcionando, só que mostrando o código puro em vez do nome — nunca quebra por causa disso.
async function buscarPessoasPorCodigo() {
  try {
    const doc = await db.collection("sifriyah").doc(DOC_ID).get();
    const blob = doc.data()?.pessoas?.blob;
    if (!blob) return null;
    const { pessoas } = decryptJSON(blob, APP_PASSWORD);
    const mapa = new Map();
    for (const p of pessoas || []) {
      if (p.codigoUsuario) mapa.set(p.codigoUsuario.toUpperCase(), p);
    }
    return mapa;
  } catch (e) {
    console.error("Não consegui decifrar as pessoas (senha errada?):", e.message);
    return null;
  }
}

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

function montarMensagem(pf, pessoasPorCodigo) {
  if (pf.tipo === "sugestao") {
    const livro = pf.tituloLivro || "(sem título)";
    const autor = pf.autorSugerido ? ` — ${pf.autorSugerido}` : "";
    const editora = pf.editoraSugerida ? ` (${pf.editoraSugerida})` : "";
    let quem = "";
    if (pf.codigoUsuario) {
      const pessoa = pessoasPorCodigo ? pessoasPorCodigo.get(pf.codigoUsuario.toUpperCase()) : null;
      quem = pessoa ? [pessoa.nome, pessoa.sobrenome].filter(Boolean).join(" ") : `código ${pf.codigoUsuario}`;
    } else if (pf.nome) {
      quem = [pf.nome, pf.sobrenome].filter(Boolean).join(" ");
    }
    return `📚 Nova sugestão de livro\n${livro}${autor}${editora}${quem ? `\nsugerido por ${quem}` : ""}`;
  }

  const tipo = pf.tipo === "reserva" ? "📖 Nova reserva" : "⏳ Novo pedido de fila";
  const livro = pf.tituloLivro || "(livro)";

  let quem = "";
  if (pf.codigoUsuario) {
    const pessoa = pessoasPorCodigo ? pessoasPorCodigo.get(pf.codigoUsuario.toUpperCase()) : null;
    quem = pessoa
      ? [pessoa.nome, pessoa.sobrenome].filter(Boolean).join(" ") + (pessoa.telefone ? ` · ${pessoa.telefone}` : "")
      : `código ${pf.codigoUsuario} (não encontrado — confira na aba Pessoas)`;
  } else {
    quem = [pf.nome, pf.sobrenome].filter(Boolean).join(" ") + (pf.telefone ? ` · ${pf.telefone}` : "");
  }

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
    .get();

  // filtra e ordena aqui em vez de na query — assim não precisa de um índice composto no
  // Firestore (que exigiria um passo manual extra pra cada biblioteca replicada). A lista de
  // pedidos pendentes é sempre pequena, então filtrar do lado do script é barato.
  const novos = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((pf) => (pf.criadoEm || 0) > ultimoAvisoEm)
    .sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));

  if (novos.length === 0) {
    console.log("Nenhum pedido novo.");
    return;
  }

  // só busca/decifra as pessoas se realmente existir pedido novo com código pra resolver —
  // evita gastar isso à toa na maioria das checagens (onde não há nada pra avisar)
  const precisaPessoas = novos.some((pf) => !!pf.codigoUsuario);
  const pessoasPorCodigo = precisaPessoas ? await buscarPessoasPorCodigo() : null;

  let maiorCriadoEm = ultimoAvisoEm;
  for (const pf of novos) {
    maiorCriadoEm = Math.max(maiorCriadoEm, pf.criadoEm || 0);
    await enviarTelegram(montarMensagem(pf, pessoasPorCodigo));
    console.log(`Avisado: ${pf.id}`);
  }

  await estadoRef.set({ ultimoAvisoEm: maiorCriadoEm }, { merge: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
