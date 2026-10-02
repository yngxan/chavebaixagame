# LowKey — Praça 001 · Multiplayer LAN

Primeira sala compartilhada do protótipo social LowKey. O servidor usa Node.js; o teste local salva contas em arquivo e a versão online usa PostgreSQL com o pacote `pg`.

## Abrir a sala

## Cidade ao redor da praça

A praça original e seu palco continuam no centro. A primeira expansão tem ruas de mão dupla, faixas de pedestre, calçadas, 60 construções (prédios, lojas e casas), árvores e postes que acendem no ciclo noturno. As construções são fachadas externas por enquanto, sem interiores. Carros, motos e jogadores usam as mesmas colisões e alturas no cliente e no servidor; o terreno agora vai de -120 a +120 nos dois eixos.

### Ilha, praia e píer

O mar cerca a cidade, com areia nas bordas e uma praia maior ao sul. Uma rampa leva ao píer elevado, com quiosques, roda-gigante e uma pequena montanha-russa animada. Os brinquedos são cenográficos nesta etapa; ainda não há embarque. Postes e luzes do parque acendem à noite. O mundo navegável vai de -210 a +210 em X e de -210 a +340 em Z.

A água tem ondas geométricas, reflexo estilizado do céu, brilho e espuma junto à costa. A flutuação usa a mesma função e o mesmo relógio das ondas. Entrar na água ativa natação e movimentos de braços/pernas, também sincronizados entre jogadores; voltar à areia termina a natação. Não existe chão invisível no mar, carros continuam limitados ao terreno, e não é possível subir através do deck vindo de baixo do píer.

O biotipo feminino tem volume discreto de peito e quadris/glúteos sob a roupa, tanto no avatar local quanto nos outros jogadores. O biotipo masculino permanece inalterado.

Prévia da praia: `http://localhost:4197/?preview=beach` (inicie a prévia isolada com `LOWKEY_PREVIEW_PORT=4197`). Para conferir o parque à noite, acrescente `&lighting=night`. Estas mudanças ainda precisam ser publicadas para aparecer na versão online.

`city-layout.js` define o mapa compartilhado; `city-client.js` monta os detalhes em lotes de instâncias e limita as luzes urbanas reais aos seis postes próximos. Não há tráfego automático nem jogadores artificiais.

Prévia local isolada: rode `node tests/preview-startup.mjs` e abra `http://localhost:4196/?preview=city` para a vista aérea. A vista aérea só existe no localhost e não entra na sala. Use `http://localhost:4196/` para testar o jogo; as contas dessa prévia são descartáveis e não são as contas online.

### Iniciar o servidor

1. Extraia o ZIP inteiro para uma pasta.
2. Instale Node.js 20 ou mais recente no computador que vai hospedar a sala.
3. Abra `INICIAR-SALA.bat` e aceite acesso à rede privada se o Windows perguntar.
4. No navegador do computador anfitrião, abra `http://localhost:4173`.
5. A janela do servidor mostra também um endereço de rede, por exemplo `http://192.168.0.15:4173`. Envie esse endereço às pessoas conectadas ao mesmo Wi-Fi.
6. Cada pessoa abre o endereço no Edge ou Chrome, cria sua conta ou entra com usuário e senha e clica em **Começar · Capturar mouse**. No teste local, a voz funciona em `localhost`; para outros aparelhos na rede ou pela internet, use o endereço HTTPS hospedado.

A sala existe enquanto a janela do servidor estiver aberta. O servidor precisa ficar ligado; não feche a janela durante a sessão.

## Preparar teste pela internet

O arquivo `render.yaml` configura o servidor Node como serviço web gratuito no Render. O projeto é publicado pelo repositório Git conectado ao serviço. A sala de teste está em https://lowkey-social-mvp-test.onrender.com/ e exige uma conta. A sala e as mensagens existem só na memória; contas e aparência são guardadas separadamente no banco.

## Contas e personagem salvo

- Cada jogador cria um usuário único (3 a 20 caracteres: letras sem acento, números, ponto, traço ou underline) e uma senha de 8 a 128 caracteres.
- Nome, corte, cores, roupa, barba, capuz e chave são salvos automaticamente por conta. Ao entrar novamente, inclusive em outro dispositivo no endereço online, o personagem é restaurado. O nome inicial usa o usuário escolhido.
- A sessão dura até 30 dias; **Sair** encerra a sessão. Senhas são verificadas por hash scrypt com salt individual, nunca gravadas como texto. O navegador recebe um cookie HttpOnly de sessão.
- Ainda não há recuperação de senha. Use senhas exclusivas para estas contas de teste.
- No teste local, `data/accounts.json` guarda hashes e perfis e não é enviado ao Git. Para backup local, copie esse arquivo com o servidor parado.
- No Render, configure `DATABASE_URL` com a URL **interna** do PostgreSQL da mesma região e workspace. A compilação deve executar `npm install --omit=dev && node --check server.mjs`. O servidor recusa iniciar no Render sem o banco, para evitar perda de contas no disco temporário.

O banco grátis `lowkey-social-accounts` vence em **30 de outubro de 2026**. Migre ou exporte as contas antes dessa data para continuar usando os perfis salvos.

## Controles

- **WASD** ou setas: andar
- **Shift**: correr
- **Espaço**: pular; segure para encadear bunny hops. WASD controla a direção no ar e ajuda a manter o impulso.
- **Beirada da ilha**: cair no vazio; o personagem volta a surgir no alto da praça
- **Roda do mouse**: aproximar até entrar em primeira pessoa ou afastar para terceira pessoa
- **Mover o mouse depois de Começar**: olhar/girar a câmera sem arrastar
- **Esc**: liberar o cursor para voltar aos painéis
- **Painel à direita**: mudar nome, pele, cabelo, camiseta, calça, capuz e chave
- **Avatar**: escolher modelo masculino ou feminino, corte, caimento do cabelo e pelo facial (cavanhaque, bigode, barba fechada ou combinação). Há versões média e longa do cabelo em mechas; a longa chega perto da cintura. O cabelo curto desfiado é penteado para trás, com a testa livre e mechas irregulares no topo. O dread tem anéis dourados. O painel RGB ajusta pele, cabelo, mechas, roupa, calça e tênis. Os olhos podem receber a mesma cor ou cores independentes
- **Emotes rápidos**: **1** acenar, **2** dançar, **3** bater palmas e **4** fazer coração; os botões ficam no HUD e os gestos aparecem para todos na sala
- **Chat abaixo à esquerda**: mensagens compartilhadas por todos na sala
- **Voz por proximidade**: com a voz central configurada, você ouve automaticamente os microfones ativos da sala ao chegar a até 18 unidades. A recepção fica pré-conectada e muda de muda para audível localmente ao entrar no raio. Use **Ativar microfone** para transmitir sua própria voz; desligar o microfone não impede que você continue ouvindo.

O navegador pedirá permissão do microfone somente quando você escolher transmitir. No site público, o servidor central mantém uma conexão de recepção por jogador e agrega as faixas dos microfones ativos; a proximidade só controla o áudio ouvido localmente, sem renegociar a conexão quando você se aproxima ou se afasta. A voz centralizada só fica ativa quando as credenciais do SFU estiverem configuradas no Render. Em `localhost`, sem credenciais, o jogo mantém o modo direto de teste, que ainda depende do botão de microfone para estabelecer voz.

## Configurar voz centralizada no Render

1. No painel da Cloudflare, crie uma aplicação em **Realtime → Serverless SFU** e copie o App ID e o App Secret.
2. No Render, abra o serviço `lowkey-social-mvp-test` → **Environment** e adicione `CF_SFU_APP_ID` e `CF_SFU_APP_SECRET` com esses valores. Salve e aguarde o serviço reiniciar.
3. Para conexões mais confiáveis em redes restritivas, crie também uma chave em **Realtime → TURN**, gere um API token com acesso para emitir credenciais TURN e adicione no Render `CF_TURN_KEY_ID` (ID da chave TURN) e `CF_TURN_API_TOKEN` (token secreto). O servidor emite credenciais temporárias; o token nunca vai para o navegador.
4. Atualize o jogo. O status da voz deve indicar **VOZ CENTRAL** quando conectar.

Não coloque o App Secret neste repositório nem o envie no chat. O segredo só é usado pelo servidor Node do Render. A Cloudflare inclui 1.000 GB por mês de tráfego de saída para Realtime SFU/TURN; acima disso, a tarifa publicada é US$ 0,05 por GB. Consulte [preços oficiais](https://developers.cloudflare.com/realtime/sfu/pricing/) antes de abrir o teste para muita gente.

## O que já dá para experimentar

Uma praça 3D blocada flutua no céu, com camadas visíveis de terra e pedra sob o gramado, sem paredes ou limite invisível de caminhada. O jogador entra caindo do alto; ao sair da ilha, cai no vazio e reaparece acima da praça. O cenário tem iluminação solar e de preenchimento, sombras suaves e sombras de contato, portal de entrada, árvores, flores, vaga-lumes, palco, bancos, luminárias e um marco em forma de chave. Os avatares agora usam malhas 3D arredondadas e suaves, com proporção chibi, cabelo volumoso em mechas, rosto expressivo, roupas largas e tênis destacados. Cada pessoa escolhe um dos dois modelos de corpo e um corte de cabelo independente; aparência, corte, cores, nome, posição, caminhada e salto sincronizam entre jogadores, que mantêm escala igual. Os movimentos remotos são interpolados para ficarem mais fluidos, e a pose de pulo é igual para o jogador local e os demais. O contador de pessoas online é compartilhado. O chat de texto tem raio de 12 unidades e a voz de 18: a recepção central fica pronta sem ativar o microfone, e só toca quando o outro jogador está no raio. Cada jogador usa uma sessão de recepção compartilhada para a sala, em vez de negociar uma conexão por pessoa a cada mudança de distância. O segredo da Cloudflare fica apenas no servidor Render. Sem credenciais, o site público desativa voz e o teste local em `localhost` mantém o modo direto. O movimento lateral acompanha a direção visual da câmera: **A/← para a esquerda** e **D/→ para a direita**; aceleração e parada são graduais.

## Limites desta versão

Na versão local, a sala multiplayer funciona na rede local/Wi-Fi; para sócios em outros lugares, use a cópia hospedada com HTTPS. Não compartilhe a porta diretamente com a internet. O modo direto local usa STUN e pode falhar em redes restritivas. A voz do site público é desabilitada até o SFU central estar configurado. Contas e avatares persistem, mas mensagens e posições da sala somem quando o servidor reinicia. Ainda não há recuperação de senha ou moderação. A sincronização de movimento é simples e adequada para testar o conceito, não é proteção contra trapaças.

O protótipo usa Three.js 0.160.0, biblioteca 3D sob licença MIT. O aviso está em `THREE-LICENSE.txt`.
