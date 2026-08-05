// ---------------- Fila de espera (pedidos vindos da vitrine pública) ----------------
function ListaPedidosCard({ pf, livroById, erro, onAceitar, onDescartar, aceitarLabel = "Aceitar" }) {
  const livro = livroById(pf.livroId);
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1.5px solid ${COLORS.rule}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15 }}>
            {livro ? livro.titulo : pf.tituloLivro || "(livro removido)"}
          </div>
          {pf.tipo === "sugestao" && pf.autorSugerido && (
            <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 1 }}>{pf.autorSugerido}</div>
          )}
          <div style={{ fontSize: 12.5, color: COLORS.inkSoft, marginTop: 2 }}>
            {pf.codigoUsuario ? (
              <>
                código: <b style={{ fontFamily: "'JetBrains Mono', monospace" }}>{pf.codigoUsuario}</b>
              </>
            ) : pf.nome ? (
              <>
                {pf.nome} {pf.sobrenome || ""} · {pf.telefone || "sem celular"}
              </>
            ) : (
              "(sem identificação)"
            )}
          </div>
        </div>
        <Button style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => onAceitar(pf)}>
          {aceitarLabel}
        </Button>
        <Button variant="ghost" style={{ padding: "6px 12px", fontSize: 12.5 }} onClick={() => onDescartar(pf)}>
          Descartar
        </Button>
      </div>
      {erro && <div style={{ fontSize: 12.5, color: COLORS.rust }}>{erro}</div>}
    </div>
  );
}

function FilaPedidosTab({ pedidosFila, livroById, onAceitar, onDescartar }) {
  const [erros, setErros] = useState({});

  function handleAceitar(pf) {
    const r = onAceitar(pf);
    if (r && !r.ok) {
      setErros((prev) => ({ ...prev, [pf.id]: r.erro }));
    } else {
      setErros((prev) => {
        const { [pf.id]: _omit, ...resto } = prev;
        return resto;
      });
    }
  }

  const reservas = pedidosFila.filter((pf) => pf.tipo === "reserva");
  const fila = pedidosFila.filter((pf) => pf.tipo !== "reserva" && pf.tipo !== "sugestao");
  const sugestoes = pedidosFila.filter((pf) => pf.tipo === "sugestao");

  return (
    <Section eyebrow="Vitrine pública" title="Fila">
      <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
        Reservas
      </div>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
        Pedidos de reserva de livros disponíveis, enviados pelo catálogo público. Aceite pra
        marcar que já combinou a retirada com a pessoa, ou descarte se não fizer sentido. Reservas
        que ninguém aceita ou descarta expiram sozinhas depois de alguns dias (configurável em
        Ajustes) — não precisa ficar limpando pedido velho na mão.
      </div>
      {reservas.length === 0 && <EmptyState text="Nenhuma reserva pendente." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {reservas.map((pf) => (
          <ListaPedidosCard key={pf.id} pf={pf} livroById={livroById} erro={erros[pf.id]} onAceitar={handleAceitar} onDescartar={onDescartar} />
        ))}
      </div>

      <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
        Fila de espera
      </div>
      <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
        Pedidos de "entrar na fila" de livros emprestados, enviados pelo catálogo público. Aceite
        pra colocar a pessoa de verdade na fila do livro, ou descarte se não fizer sentido.
      </div>
      {fila.length === 0 && <EmptyState text="Nenhum pedido de fila pendente." />}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: sugestoes.length > 0 ? 24 : 0 }}>
        {fila.map((pf) => (
          <ListaPedidosCard key={pf.id} pf={pf} livroById={livroById} erro={erros[pf.id]} onAceitar={handleAceitar} onDescartar={onDescartar} />
        ))}
      </div>

      {sugestoes.length > 0 && (
        <>
          <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            Sugestões de livro
          </div>
          <div style={{ fontSize: 13, color: COLORS.inkSoft, marginBottom: 12 }}>
            Títulos que a biblioteca ainda não tem, sugeridos por quem visitou o catálogo. "Marcar como vista"
            só tira da lista — se decidir comprar, cadastre o livro normalmente pela aba Acervo.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sugestoes.map((pf) => (
              <ListaPedidosCard
                key={pf.id}
                pf={pf}
                livroById={livroById}
                erro={erros[pf.id]}
                onAceitar={handleAceitar}
                onDescartar={onDescartar}
                aceitarLabel="Marcar como vista"
              />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

