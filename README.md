# Jogo da Velha — WebGL 2.0

Jogo estático para navegador com renderização do tabuleiro em WebGL 2.0, IA Minimax com poda alfa-beta, níveis de dificuldade e modo para dois jogadores no mesmo dispositivo.

## Abrir localmente

Na pasta do projeto, inicie um servidor estático local com `python -m http.server 8000` e abra `http://localhost:8000`. O service worker e o modo offline precisam de `localhost` ou HTTPS; abrir o `index.html` diretamente como arquivo não ativa esses recursos.

## Publicar no GitHub Pages

1. Envie os arquivos para um repositório GitHub usando a branch `main` ou `master`.
2. No repositório, abra **Settings → Pages** e selecione **GitHub Actions** como origem de publicação.
3. A cada envio para `main` ou `master`, o workflow `.github/workflows/pages.yml` publica o jogo. Também é possível iniciar a publicação manualmente pela aba **Actions**.

O jogo usa caminhos relativos e funciona tanto em um domínio `github.io` quanto em um endereço de projeto, como `usuario.github.io/nome-do-repositorio/`.

## Observações

- O navegador precisa oferecer WebGL 2.0 para desenhar o tabuleiro.
- O modo online foi retirado: hospedagem estática no GitHub Pages não fornece, por si só, sincronização entre jogadores. O modo de dois jogadores funciona no mesmo dispositivo.
