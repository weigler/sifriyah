// ---------------- Financeiro ----------------
function FinanceiroTab({ emprestimos, cobrancas, pessoaById, livroById, totalPago, onRemoverCobranca, config }) {
  const totalMultas = emprestimos.reduce((s, e) => s + calcularMulta(e, livroById(e.livroId), config), 0);
  const totalCombinado = emprestimos.reduce((s, e) => s + (e.valorCombinado || 0), 0) + totalMultas;
  const totalRecebido = emprestimos.reduce((s, e) => s + totalPago(e), 0);
  const totalPendente = Math.max(0, totalCombinado - totalRecebido);

  const pagamentos = emprestimos
    .flatMap((e) => (e.pagamentos || []).map((p) => ({ ...p, emprestimo: e })))
    .sort((a, b) => (a.data < b.data ? 1 : -1));

  const cobrancasOrdenadas = [...cobrancas].sort((a, b) => (a.data < b.data ? 1 : -1));

  const rotuloTipo = { cobranca: "cobrança enviada", lembrete: "lembrete de prazo", sms: "cobrança por SMS" };

  const contagemPorLivro = {};
  emprestimos.forEach((e) => {
    contagemPorLivro[e.livroId] = (contagemPorLivro[e.livroId] || 0) + 1;
  });
  const ranking = Object.entries(contagemPorLivro)
    .map(([livroId, qtd]) => ({ livro: livroById(livroId), qtd }))
    .filter((r) => r.livro)
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 5);

  function exportarPDF() {
    const janela = window.open("", "_blank");
    if (!janela) {
      alert("O navegador bloqueou a janela de impressão. Permita pop-ups pra esse site e tente de novo.");
      return;
    }
    const linhasPagamentos = pagamentos
      .map((p) => {
        const pessoa = pessoaById(p.emprestimo.pessoaId);
        const livro = livroById(p.emprestimo.livroId);
        return `<tr><td>${fmtDate(p.data)}</td><td>${pessoa ? nomeCompleto(pessoa) : "—"}</td><td>${
          livro ? livro.titulo : "—"
        }</td><td style="text-align:right">${fmtMoney(p.valor)}</td></tr>`;
      })
      .join("");
    const linhasRanking = ranking
      .map((r) => `<tr><td>${r.livro.titulo}</td><td style="text-align:right">${r.qtd}x</td></tr>`)
      .join("");

    janela.document.write(`
      <html><head><meta charset="utf-8"><title>Relatório financeiro · Sifriyah</title>
      <style>
        body { font-family: Georgia, serif; color: #2B2118; padding: 32px; }
        h1 { font-size: 22px; margin-bottom: 2px; }
        .sub { color: #5B4E3F; font-size: 12px; margin-bottom: 24px; }
        h2 { font-size: 15px; border-bottom: 1px solid #D8CBB0; padding-bottom: 4px; margin-top: 28px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
        td, th { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; }
        .totais { display: flex; gap: 24px; margin-top: 8px; }
        .totais div { font-size: 13px; }
        .totais b { display: block; font-size: 17px; }
      </style></head><body>
      <h1>Sifriyah · Relatório financeiro</h1>
      <div class="sub">Gerado em ${fmtDate(todayISO())}</div>
      <div class="totais">
        <div>Combinado (todos)<b>${fmtMoney(totalCombinado)}</b></div>
        <div>Recebido<b>${fmtMoney(totalRecebido)}</b></div>
        <div>Pendente<b>${fmtMoney(totalPendente)}</b></div>
      </div>
      <h2>Livros mais emprestados</h2>
      <table>${linhasRanking || "<tr><td>Sem dados ainda.</td></tr>"}</table>
      <h2>Pagamentos recebidos</h2>
      <table><tr><th>Data</th><th>Pessoa</th><th>Livro</th><th style="text-align:right">Valor</th></tr>${
        linhasPagamentos || "<tr><td colspan=4>Sem pagamentos ainda.</td></tr>"
      }</table>
      </body></html>
    `);
    janela.document.close();
    setTimeout(() => janela.print(), 300);
  }

  return (
    <div>
      <Section eyebrow="Caixa" title="Financeiro">
        <Button variant="subtle" style={{ marginBottom: 16 }} onClick={exportarPDF}>
          🖨️ Exportar relatório (PDF)
        </Button>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          {[
            { label: "combinado (todos)", valor: totalCombinado, cor: COLORS.ink },
            { label: "multas em aberto", valor: totalMultas, cor: COLORS.rust },
            { label: "recebido", valor: totalRecebido, cor: COLORS.sage },
            { label: "pendente", valor: totalPendente, cor: COLORS.rust },
          ].map((c) => (
            <div
              key={c.label}
              style={{
                flex: "1 1 140px",
                background: COLORS.card,
                border: `1.5px solid ${COLORS.rule}`,
                borderRadius: 10,
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
                {c.label}
              </div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 20, color: c.cor }}>
                {fmtMoney(c.valor)}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {ranking.length > 0 && (
        <Section eyebrow="Ranking" title="Livros mais emprestados">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ranking.map((r, i) => (
              <div
                key={r.livro.id}
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.rule}`,
                  borderRadius: 8,
                  padding: "9px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                }}
              >
                <span>{i + 1}. {r.livro.titulo}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.gold, fontWeight: 600 }}>
                  {r.qtd}x
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section eyebrow="Histórico" title="Pagamentos recebidos">
        {pagamentos.length === 0 && <EmptyState text="Nenhum pagamento registrado ainda." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {pagamentos.map((p, i) => {
            const pessoa = pessoaById(p.emprestimo.pessoaId);
            const livro = livroById(p.emprestimo.livroId);
            return (
              <div
                key={i}
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.rule}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                  gap: 10,
                }}
              >
                <div>
                  <b>{pessoa ? nomeCompleto(pessoa) : "(pessoa removida)"}</b> · {livro ? livro.titulo : "(livro removido)"}
                  <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>{fmtDate(p.data)}</div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.sage, fontWeight: 600 }}>
                  +{fmtMoney(p.valor)}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section eyebrow="Histórico" title="Cobranças enviadas">
        {cobrancasOrdenadas.length === 0 && <EmptyState text="Nenhuma cobrança enviada ainda." />}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {cobrancasOrdenadas.map((c) => {
            const emp = emprestimos.find((e) => e.id === c.emprestimoId);
            const pessoa = emp ? pessoaById(emp.pessoaId) : null;
            const livro = emp ? livroById(emp.livroId) : null;
            return (
              <div
                key={c.id}
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.rule}`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13.5,
                  gap: 10,
                }}
              >
                <div>
                  <b>{pessoa ? nomeCompleto(pessoa) : "(pessoa removida)"}</b> · {livro ? livro.titulo : "(livro removido)"}
                  <div style={{ fontSize: 11.5, color: COLORS.inkSoft }}>
                    {rotuloTipo[c.tipo] || c.tipo} · {fmtDate(c.data)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {c.valor > 0 && (
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.gold, fontWeight: 600 }}>
                      {fmtMoney(c.valor)}
                    </div>
                  )}
                  <BotaoExcluir small onConfirm={() => onRemoverCobranca(c.id)} />
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

