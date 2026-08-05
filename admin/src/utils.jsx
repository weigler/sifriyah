const { useState, useEffect, useMemo, useRef } = React;

// polyfill de armazenamento local (usado como fallback quando não há nuvem conectada, e para
// guardar a lista de backups feitos localmente)
window.storage = {
  async get(key) {
    const v = localStorage.getItem(key);
    return v !== null ? { key, value: v, shared: false } : null;
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value, shared: false };
  },
};

// ---- Fontes ----
function useFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Source+Serif+4:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

const STORAGE_KEY = "sifriyah-biblioteca-dados"; // v1.1
const APP_NAME = "Sifriyah"; // ספרייה — hebraico moderno para "biblioteca"

const COLORS = {
  cream: "#F5EFE0",
  card: "#FBF7EC",
  ink: "#2B2118",
  inkSoft: "#5B4E3F",
  burgundy: "#6B2737",
  burgundyDark: "#4E1C28",
  gold: "#B8933E",
  sage: "#4B6B4A",
  rust: "#9C4A2C",
  whats: "#2E7D5B",
  rule: "#D8CBB0",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// código curto de usuário (pra digitar no catálogo público) — sem 0/O, 1/I/L, pra evitar confusão
const CODIGO_USUARIO_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function gerarCodigoUsuario(existentes) {
  const usados = new Set((existentes || []).filter(Boolean).map((c) => c.toUpperCase()));
  let codigo;
  do {
    codigo = Array.from({ length: 6 }, () => CODIGO_USUARIO_CHARS[Math.floor(Math.random() * CODIGO_USUARIO_CHARS.length)]).join("");
  } while (usados.has(codigo));
  return codigo;
}

function todayISO() {
  // não usa toISOString() aqui de propósito: ela sempre devolve a data em UTC, então à noite
  // no Brasil (UTC-3) já mostraria o dia seguinte. getFullYear/getMonth/getDate usam o fuso
  // horário local do navegador, que é o que a gente realmente quer.
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtMoney(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDataHora(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes}/${d.getFullYear()} às ${hh}:${mm}`;
}

function daysBetween(iso) {
  const d1 = new Date(iso);
  const d2 = new Date(todayISO());
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

function somarSemanas(iso, semanas) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + semanas * 7);
  return d.toISOString().slice(0, 10);
}

// dias de atraso de um empréstimo (0 se já foi devolvido, sem prazo, ou ainda dentro do prazo)
function diasAtraso(emp) {
  if (!emp || emp.devolvido || !emp.prazo) return 0;
  return Math.max(0, daysBetween(emp.prazo));
}

// multa por atraso: cobra o valor da semana extra do livro (ou o valor semanal, se não houver
// um valor de semana extra específico) por cada semana ou fração de atraso — a mesma lógica de
// "renovar por mais uma semana", só que cobrada automaticamente quando ninguém renovou a tempo.
// Pode ser anulada manualmente por empréstimo (emp.multaAnulada), pra cobrir esquecimentos de
// marcar a devolução no sistema.
function calcularMulta(emp, livro, config) {
  if (!emp || emp.multaAnulada) return 0;
  const dias = diasAtraso(emp);
  if (dias <= 0) return 0;
  const semanas = Math.ceil(dias / 7);
  const valorSemana =
    (config && config.valorMultaSemanal) || (livro && (livro.valorSemanaExtra || livro.valorSemanal)) || 0;
  let multa = semanas * valorSemana;
  // teto opcional (config.tetoMulta) — evita que um empréstimo esquecido por meses vire uma
  // dívida impagável; acima do teto, a multa simplesmente para de crescer
  if (config && config.tetoMulta) multa = Math.min(multa, config.tetoMulta);
  return multa;
}

// dias que faltam pro prazo de um empréstimo ainda ativo: positivo = ainda faltam N dias,
// 0 = vence hoje, negativo = já passou do prazo (nesse caso quem cuida é diasAtraso/calcularMulta,
// não esta função — ela só serve pro aviso de "vencendo em breve", não de atraso)
function diasParaVencer(emp) {
  if (!emp || emp.devolvido || !emp.prazo) return null;
  return -daysBetween(emp.prazo);
}

// gera e baixa um arquivo CSV a partir de um cabeçalho e uma lista de linhas (arrays de valores) —
// usado nos botões de exportar dados em Ajustes. Inclui um BOM no início pra acentos abrirem
// certo quando o arquivo é aberto no Excel.
function baixarCSV(nomeArquivo, cabecalho, linhas) {
  function escaparCampo(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const conteudo = [cabecalho, ...linhas].map((linha) => linha.map(escaparCampo).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// calcula o valor do empréstimo a partir do valor semanal x limite de semanas do livro,
// já aplicando o desconto da promoção ativa (se houver e ainda estiver válida)
function calcularValorSugerido(livro, promocao) {
  if (!livro || !livro.valorSemanal || !livro.limiteSemanas) return null;
  let valor = livro.valorSemanal * livro.limiteSemanas;
  const promoValida =
    promocao?.ativa && (!promocao.validoAte || promocao.validoAte >= todayISO());
  if (promoValida && promocao.desconto) {
    valor = valor * (1 - promocao.desconto / 100);
  }
  return Math.round(valor * 100) / 100;
}

