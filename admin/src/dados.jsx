function statusParaErro(e) {
  return e && e.code === "permission-denied" ? "sem-login" : "erro";
}

function nomeCompleto(p) {
  if (!p) return "";
  return `${p.nome || ""}${p.sobrenome ? " " + p.sobrenome : ""}`.trim();
}
// escolhe a palavra certa (ele/ela, ou outra dupla) conforme o gênero cadastrado da pessoa;
// se não tiver gênero informado, usa a alternativa neutra (ou feminino, se nenhuma neutra for passada)
function pronomeGenero(p, masculino, feminino, neutro) {
  if (p?.genero === "M") return masculino;
  if (p?.genero === "F") return feminino;
  return neutro !== undefined ? neutro : feminino;
}
function separarNome(nomeFull) {
  const partes = (nomeFull || "").trim().split(/\s+/);
  if (partes.length <= 1) return { nome: partes[0] || "", sobrenome: "" };
  return { nome: partes.slice(0, -1).join(" "), sobrenome: partes[partes.length - 1] };
}

// migra dados salvos no formato antigo (contatos como dicionário, sem páginas/nuvem etc.)
function migrarDados(parsed) {
  const livros = (parsed.livros || []).map((l) => ({
    paginas: null,
    dataAquisicao: null,
    capaUrl: null,
    valorSemanal: null,
    valorSemanaExtra: null,
    valorReposicao: null,
    limiteSemanas: null,
    categoria: "",
    tags: [],
    quantidade: 1,
    nivel: "",
    sinopse: "",
    linkExterno: "",
    ...l,
    tags: l.tags || [],
    quantidade: l.quantidade || 1,
  }));

  let pessoas = parsed.pessoas;
  if (!pessoas) {
    const contatos = parsed.contatos || {};
    const nomesUnicos = new Set([
      ...Object.keys(contatos),
      ...((parsed.emprestimos || []).map((e) => e.pessoa).filter(Boolean)),
    ]);
    pessoas = Array.from(nomesUnicos).map((nomeFull) => {
      const { nome, sobrenome } = separarNome(nomeFull);
      const c = contatos[nomeFull] || {};
      return { id: uid(), nome, sobrenome, telefone: c.telefone || "", email: c.email || "" };
    });
  }

  // categorias/tags já cadastradas nos livros entram automaticamente na lista, mesmo em dados antigos
  const categoriasDosLivros = livros.map((l) => l.categoria).filter(Boolean);
  const tagsDosLivros = livros.flatMap((l) => l.tags || []);
  const categorias = Array.from(new Set([...(parsed.categorias || []), ...categoriasDosLivros]));
  const tags = Array.from(new Set([...(parsed.tags || []), ...tagsDosLivros]));

  return {
    livros,
    emprestimos: (parsed.emprestimos || []).map((e) => ({
      ...e,
      pagamentos: (e.pagamentos || []).map((p) => ({ id: p.id || uid(), ...p })),
    })),
    pessoas,
    cobrancas: parsed.cobrancas || [],
    filas: parsed.filas || [],
    categorias,
    tags,
    config: {
      pix: "",
      recebedor: "",
      whatsappContato: "",
      linkVitrine: "",
      promocao: { ativa: false, descricao: "", validoAte: "", desconto: 0 },
      ...(parsed.config || {}),
    },
  };
}

// separa os dados completos nas 4 seções (usado ao salvar/fazer backup)
function montarSecoes({ livros, categorias, tags, pessoas, emprestimos, cobrancas, filas, config }) {
  return {
    acervo: { livros, categorias, tags },
    pessoas: { pessoas },
    emprestimos: { emprestimos, cobrancas, filas },
    ajustes: { config },
  };
}

// junta as seções decodificadas de volta num único objeto (pra passar por migrarDados)
function combinarSecoes(decodificadoPorSecao) {
  return {
    livros: decodificadoPorSecao.acervo?.livros,
    categorias: decodificadoPorSecao.acervo?.categorias,
    tags: decodificadoPorSecao.acervo?.tags,
    pessoas: decodificadoPorSecao.pessoas?.pessoas,
    emprestimos: decodificadoPorSecao.emprestimos?.emprestimos,
    cobrancas: decodificadoPorSecao.emprestimos?.cobrancas,
    filas: decodificadoPorSecao.emprestimos?.filas,
    config: decodificadoPorSecao.ajustes?.config,
  };
}

function normalizaTelefone(tel) {
  const digits = (tel || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 11) return "55" + digits; // assume Brasil, DDD+numero
  return digits;
}

function linkWhatsApp(telefone, texto) {
  const num = normalizaTelefone(telefone);
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}

function linkSMS(telefone, texto) {
  const num = (telefone || "").replace(/\D/g, "");
  return `sms:${num}?body=${encodeURIComponent(texto)}`;
}

