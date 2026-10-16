# Jogo da Velha — WebGL 2.0

Jogo para navegador com renderização do tabuleiro em WebGL 2.0, IA Minimax com poda alfa-beta, modo local e partidas online usando Supabase Realtime. O menu permite configurar o modo e quem começa (X, O ou aleatório) antes de abrir o tabuleiro. A interface inclui placar, jogadas da rodada e histórico das partidas recentes.

## Abrir localmente

Na pasta do projeto, inicie um servidor estático local com `python -m http.server 8000` e abra `http://localhost:8000`. O service worker e o modo offline precisam de `localhost` ou HTTPS; abrir o `index.html` diretamente como arquivo não ativa esses recursos.

## Publicar no GitHub Pages

1. Envie os arquivos para um repositório GitHub usando a branch `main` ou `master`.
2. No repositório, abra **Settings → Pages** e selecione **GitHub Actions** como origem de publicação.
3. A cada envio para `main` ou `master`, o workflow `.github/workflows/pages.yml` publica o jogo. Também é possível iniciar a publicação manualmente pela aba **Actions**.

O jogo usa caminhos relativos e funciona tanto em um domínio `github.io` quanto em um endereço de projeto, como `usuario.github.io/nome-do-repositorio/`.

## Configurar partidas online

1. Em `supabase-config.js`, informe a Project URL e a chave Publishable (ou anon) do projeto Supabase. Essa chave pública é usada pelo navegador; nunca coloque uma chave Secret ou `service_role` nesse arquivo.
2. No Supabase, deixe **Realtime → Settings → Allow public access to channels** ativado.
3. Publique o projeto no GitHub Pages. Em **Online com convite**, informe seu nome, escolha quem começa, crie uma sala e envie o link, ou procure salas abertas e entre em uma delas.

As salas mostram os nomes e símbolos dos participantes, avisam quando o adversário entra e oferecem um chat com mensagens destacadas por jogador. Usam Broadcast e Presence, sem criar tabelas no banco. Os canais públicos permitem que qualquer pessoa com a chave pública do projeto envie e receba eventos; use o modo por convite para partidas casuais, não para torneios ou partidas com dados sensíveis.

## Observações

- O navegador precisa oferecer WebGL 2.0 para desenhar o tabuleiro.
- GitHub Pages hospeda os arquivos estáticos. A sincronização entre jogadores é feita pelo Supabase Realtime.
- No modo local, placar e histórico ficam salvos no navegador. Em uma sala online, o placar e o histórico da sala são compartilhados entre os dois jogadores; as jogadas exibidas correspondem à rodada atual.
