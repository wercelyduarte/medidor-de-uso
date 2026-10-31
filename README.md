# Medidor de uso para Claude Code

Painel que fica ao lado do chat no Claude Code (aba Code do app desktop, terminal e VS Code) e mostra quanto do seu plano já foi usado:

- limite de 5 horas e limite semanal (7 dias), em porcentagem, com barra e o horário em que reinicia;
- quanto do contexto da conversa atual está ocupado;
- no modo Detalhes, o custo estimado da sessão em preço de API (no plano por assinatura isso não é cobrado; serve de referência).

```
5h  ████░░░░░░ 42%  hoje 18:40
7d  █████████░ 91%  sex 07/11 09:00
ctx ██░░░░░░░░ 25%
```

Os números vêm das próprias respostas do Claude e se atualizam a cada resposta. O nome do plano (Pro, Max) e o saldo de créditos extras não ficam disponíveis para mods.

## Instalação

Dentro do Claude Code:

```
/plugin install medidor-de-uso --marketplace wercelyduarte/medidor-de-uso
```

Ou num terminal:

```
claude plugin install medidor-de-uso --marketplace wercelyduarte/medidor-de-uso
```

Responda `y` para adicionar o marketplace e escolha o escopo de usuário.

No app desktop (aba Code): clique no **+** ao lado da caixa de mensagem, depois **Plugins**, **Add marketplace** com `wercelyduarte/medidor-de-uso`, e então **Add plugin**.

## Uso

- O painel abre sozinho ao iniciar uma sessão, no modo compacto. O botão **Detalhes** mostra a versão completa e **Compacto** volta; a escolha fica guardada.
- Feche no X do painel; `/consumo` abre de novo.
- Para desligar de vez: **+** ao lado da caixa de mensagem, **Plugins**, e desative "medidor-de-uso".

A API de mods do Claude Code ainda está em acesso antecipado e pode mudar entre versões.

## Apoie

Se o painel te ajuda, você pode apoiar pelo botão **Sponsor** no topo desta página.

## Licença

MIT
