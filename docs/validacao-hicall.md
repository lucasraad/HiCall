# Validação das alterações do HiCall

## Preparação

Frontend e backend devem usar a mesma versão. A configuração atual do frontend
local encaminha a API para produção; iniciar o Angular não executa o backend local.
As mudanças de cargos e banimento exigem a API atualizada e a migration
`2026_11_13_000000_add_role_hierarchy_and_ban_permission.php` no banco escolhido.
Não foi aplicada migration no banco da aplicação durante este trabalho.

No ambiente de desenvolvimento ou homologação configurado, execute
`php artisan migrate` na pasta `backend`. A migration adiciona nível e permissão
de banimento. Cargos existentes começam no nível 1; quem já podia expulsar do
servidor mantém a permissão de banir, pois a ação antiga também bania.
As colunas antigas de transcrição e a tabela de personalização são preservadas,
mas não são mais expostas por endpoints ou pela interface.

## Testes automatizados

- Frontend, dentro de `frontend`: `npm.cmd test -- --watch=false --browsers=ChromeHeadlessAudio`.
- Build, dentro de `frontend`: `npm.cmd run build`.
- Backend, dentro de `backend`: `php vendor/phpunit/phpunit/phpunit --do-not-cache-result`.

A suíte PHP usa SQLite em memória conforme `phpunit.xml`. Nesta execução também
foram definidos explicitamente APP_ENV=testing, DB_CONNECTION=sqlite,
DB_DATABASE=:memory:, DB_URL vazio e chave de aplicação exclusiva de teste.
Foi utilizado PHP portátil oficial em `.tmp-e2e/php-test`, com extensões
mbstring, openssl, fileinfo, pdo_sqlite e sqlite3; essa pasta é ignorada pelo Git.

## Roteiro manual com duas pessoas

1. Iniciar chamada e transmitir tela com áudio. No receptor, liberar o volume
   da transmissão, silenciar pelo botão e conferir que a voz permanece audível.
2. Reativar o áudio e conferir a recuperação do volume anterior. Repetir em tela
   cheia, após parar e reiniciar a transmissão e entrando na chamada com a tela
   já compartilhada. Nenhuma etapa deve exigir reconectar.
3. Criar cargos com níveis 1 e 2 e permissões de moderação. O nível 2 deve poder
   moderar o nível 1; igual ou superior, dono, admin e o próprio moderador devem
   ser protegidos. Conferir também a recusa pela API.
4. Expulsar somente da chamada: a pessoa continua membro e pode entrar novamente.
   Expulsar do servidor: remove associação e presença sem criar banimento ou
   trocar convite. Banir: bloqueia reentrada e mantém a troca de convite existente.
5. Testar os quatro modos do redutor: Desligado, Padrão do dispositivo,
   HiCall no microfone e HiCall no microfone mais vozes recebidas. Alternar sem
   sair da chamada, inclusive com microfone silenciado. RNNoise deve processar
   vozes, preservando o som de transmissão. Comparar teclado/ventilador com fala.
6. Conferir ausência de transcrição e personalização de marca na administração
   e nos canais. Administração de usuários, PWA e download desktop permanecem.

Os testes automatizados cobrem regressões de separação de faixas, volume,
recriação do elemento de áudio, modos de captura e regras de moderação. A qualidade
perceptiva do filtro e a ocorrência intermitente relatada ainda precisam deste
teste manual em dispositivos reais, incluindo o Electron.
