# Ritmo

Teleprompter local para leitura de arquivos EPUB.

## Executar

Requer Node.js 20.19+ ou 22.12+.

```sh
npm install
npm run dev
```

Abra o endereço indicado pelo Vite, clique em **Abrir EPUB** e escolha seu livro.

## Controles

- **Espaço:** iniciar ou pausar a rolagem.
- **Setas para cima/baixo:** aumentar ou diminuir a velocidade.
- **Page Up/Page Down:** navegar entre capítulos.
- Os controles na parte inferior ajustam velocidade, tamanho da letra e tema.
- O botão de largura no topo do leitor ajusta a largura do texto.

Os arquivos EPUB são lidos localmente no navegador. Preferências e posição de leitura são guardadas neste dispositivo.

## Publicar no GitHub Pages

O workflow em `.github/workflows/deploy.yml` compila e publica o app ao enviar alterações para `main` (ou ao executar manualmente o workflow em **Actions**).

Na primeira publicação, abra **Settings → Pages** no repositório e selecione **GitHub Actions** como fonte de publicação. O endereço será `https://<usuario>.github.io/<repositorio>/`; o build configura automaticamente o caminho base para o nome do repositório.
