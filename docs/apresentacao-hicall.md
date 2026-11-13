# Apresentação web do HiCall

Implementada na aplicação Angular existente, sem novo serviço ou publicação.

## Acessos

- `/`: apresentação pública, sem chamadas à API ou permissão de mídia.
- `/app`: aplicativo, protegido por autenticação.
- `/login`: entrada; usuários conectados são encaminhados para `/app`.
- `/servidor/:serverId` e `/servidor/:serverId/canal/:channelId`: links preservados.
- `/downloads/HiCall-Setup.exe`: instalador Windows já existente.

O desktop e o manifesto PWA passam a iniciar em `/app`. Instaladores antigos
que ainda abrem `/` também são encaminhados ao aplicativo pelo guard de entrada.
O instalador existente não foi reconstruído nem substituído nesta etapa.

## Experiência

A página usa a identidade escura do produto com destaque azul-claro. A prévia
ilustrativa permite alternar entre conversa, compartilhamento e controle de áudio.
O mute da demonstração altera apenas seu estado visual; não inicia ou controla
uma chamada real. Nomes e cenas são ilustrativos, identificados como prévia.

Os recursos apresentados são servidores/canais, compartilhamento de tela,
controles de áudio e cargos/moderação. Não há preços, depoimentos, números de
usuários ou cadastro público. Os acessos finais repetem abertura do app e download.

Animações usam CSS, sem timers, vídeos automáticos, bibliotecas adicionais ou
requisições externas. Há botão de pausa, foco visível, link de pular conteúdo e
respeito a `prefers-reduced-motion`. O layout empilha as seções em telas pequenas.

## Execução e validação

Em `frontend`, use `npm.cmd start` e abra `http://localhost:4200/`.
O proxy de API permanece apontando para produção; os testes de chamadas e
moderação continuam sujeitos à preparação descrita em `validacao-hicall.md`.

Comandos de verificação:

```powershell
npm.cmd test -- --watch=false --browsers=ChromeHeadlessAudio --progress=false
npm.cmd run build -- --progress=false
```

Os testes da apresentação verificam acesso público, proteção do app, links
diretos, compatibilidade desktop, botões de acesso, troca de cenas e pausa/mute
ilustrativos. Os 10 testes focados passaram em Chrome headless; a execução
precisou ser interrompida após o sucesso porque o Chrome ficou preso no
encerramento. A suíte completa foi interrompida durante a compilação e não teve
resultado nesta etapa. O limite temporário `NG_BUILD_MAX_WORKERS=2` foi utilizado
para reduzir a concorrência do compilador. A revisão visual no navegador do usuário foi interrompida pela
ferramenta de Computer Use, que não conseguiu confirmar a URL atual do Chrome.
Conferir visualmente em desktop e celular antes de publicar.

Para publicar, o host precisa entregar `index.html` também em rotas como `/app`;
esse requisito já existia para os links diretos de servidores e canais.
