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

## Polícia e perseguição

A delegacia fica a oeste da praça, em **x -46 / z -18**, substituindo o primeiro Mercado. A entrada está aberta, com recepção e uma cela no fundo.

- Duas viaturas fazem rondas nas ruas, com dois policiais em cada uma; dois outros policiais ficam na delegacia.
- Disparos aceitos pelo servidor, agressões e ataques aos policiais aumentam a perseguição de uma a cinco estrelas. Requisições rejeitadas não geram crimes.
- Viaturas perseguem pelas ruas; policiais descem e tentam capturar o suspeito. O nível diminui quando ele fica longe da polícia sem cometer novos crimes.
- A captura exige proximidade por 1,2 segundo e suspeito a pé ou veículo quase parado. A prisão dura 20 segundos, com contador, movimento e armas bloqueados. Reconectar não elimina a prisão.
- A praça continua sem armas e tiros. A polícia pode seguir e capturar quem já estiver procurado lá dentro; perseguições são suspensas durante Zombies.
- Policiais revidam disparos validados, com tempo de reação, chance de errar e cadência limitada. Obstáculos e a praça bloqueiam os tiros; agressões sem arma continuam levando à captura. Viaturas de polícia ainda não podem ser dirigidas pelos jogadores.
- A perseguição usa viaturas mais rápidas, policiais espaçados e a última posição vista. Após perder o suspeito, a primeira estrela diminui depois de 60 segundos sem novos crimes, e as seguintes a cada 20 segundos.
- Equipes são distribuídas entre os procurados. Reforços saem pela porta da delegacia em fila e embarcam antes da perseguição, limitados a seis viaturas de patrulha e 18 policiais. O crime inicia uma busca pela última posição conhecida, mesmo sem contato visual inicial. Viaturas com equipe incompleta recolhem outro policial na delegacia e retomam a ronda com uma dupla. Viaturas vazias são reaproveitadas antes de criar novas; se não forem necessárias, somem após 30 segundos. Policiais renascem na delegacia após 30 segundos. Viaturas cedem passagem em conflitos frontais.

Na recuperação das patrulhas, policiais renascem em posições livres e usam pontos de ronda separados. Ao passar pela porta, deixam imediatamente a etapa de saída, sem formar fila num único ponto externo. Viaturas que saíram da rota procuram um caminho de volta à rua respeitando árvores e prédios, com busca limitada e espaçada para não pesar em cada atualização.

A polícia verifica colisores próximos, distribui buscas de caminhos entre atualizações e reutiliza verificações de obstáculos por intervalos curtos. As posições continuam chegando dez vezes por segundo, com precisão milimétrica. As partes fixas dos policiais são desenhadas em conjuntos por material dentro de cada articulação; a geometria e as animações são preservadas, e armas/acessórios que os NPCs não usam não são criados.

Após 30 segundos sem procurados, as equipes extras voltam à delegacia e são retiradas; a cidade mantém duas viaturas de patrulha sem acumular reforços indefinidamente.

A roda-gigante e a montanha-russa aceitam dois jogadores por banco (16 cabines na roda; três bancos no trem). Aproxime-se da placa de entrada e use **E** ou **EMBARCAR** no celular. Só é possível embarcar/desembarcar com o banco parado na estação; a roda espera cinco segundos em cada parada, e o trem dez segundos entre voltas de cinquenta segundos. O servidor reserva os assentos e controla o percurso; os clientes desenham os passageiros e os brinquedos com o mesmo relógio, sem enviar posição de cada cabine a cada quadro. Desconexão, morte e reinício liberam a vaga. Armas e emotes ficam bloqueados durante o passeio.

Comandos: `/spawn` leva qualquer jogador vivo de volta à praça (intervalo de 15 segundos, bloqueado em combate, perseguição, prisão e Zombies). Administradores podem usar `/resetcops` para restaurar duas viaturas, seis policiais e limpar perseguições/prisões, ou `/resetgame` para parar Zombies, remover veículos extras, restaurar o estoque e levar os jogadores à praça. Contas, aparência e administradores salvos são mantidos. Há cinco segundos entre reinícios.

## Mapa da cidade

- **M** no PC ou o botão **MAPA** no celular abre o mapa, com posição e direção do jogador, ruas, praça safe, delegacia, garagem, boutiques, praia, píer e marina.
- Durante uma perseguição, os policiais vivos aparecem em azul, com posições atualizadas dez vezes por segundo. Fora da perseguição os policiais ficam ocultos no mapa. O mapa não pausa o servidor; feche com M, Escape ou ×.

## Marina (prévia local)

- No fim do píer, a passagem central desce até o deck da marina. Jetski para duas pessoas e lancha para dez (motorista + nove passageiros).
- Entre com E ou o botão de interação; WASD/analógico dirigem, espaço/botão de freio desaceleram. Freie antes de sair; fora do cais, sair coloca o jogador na água para nadar.
- Ondas, limites do oceano e colisões são compartilhados entre servidor e cliente. As embarcações não atravessam a areia ou o píer. A marina repõe o estoque depois que a embarcação se afasta, sem sobrepor outra embarcação.
- Cores selecionáveis no cais; embarcações sem ninguém por três minutos são removidas, exceto o estoque da marina.

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

## Entregas simples e interface móvel

Abra **ENTREGAS**, retire o pacote com um contato e leve ao outro. Locais, nomes, cabelos e roupas são sorteados em calçadas, praia e píer, fora dos obstáculos. O mapa mostra o contato da etapa atual. Desça do veículo para retirar e entregar. O pagamento é 75 LK$ + 2 LK$ por metro estimado entre contatos, sem dinheiro real. Saldo e contagem são salvos por conta. Há dez minutos por missão e trinta segundos entre entregas concluídas. Morte, prisão, Zombies ou `/resetgame` cancelam a entrega; reconectar preserva missão, contatos e recompensa. Cancelar não apaga saldo. Bater de frente numa viatura carregando o pacote gera pelo menos duas estrelas, sem acumular estrelas a cada quadro; pequenos encostos, colisões traseiras e marcha à ré não acionam isso.

O servidor verifica posição e etapa, ignora recompensas enviadas pelo cliente e serializa operações para impedir pagamentos duplicados. A versão online usa `lowkey_missions`; a prévia usa `data/missions.json`. Cada missão mantém dois contatos locais e um marcador reutilizado: consultas não duplicam os bonecos. Terminar, cancelar ou sair remove os contatos e libera recursos. O cache do servidor é limitado a 256 contas. A área segura acompanha a borda interna das ruas da praça, incluindo a calçada, sem bloquear armas no asfalto. As viaturas participam da colisão no servidor, na previsão do motorista e no movimento a pé.

No celular, atalhos de mapa, telefone e entregas ficam separados de movimento e combate. Os controles principais têm área mínima de 44 px. Editar o avatar esconde controles conflitantes, mantém a prévia na vertical e enquadra o personagem à esquerda na horizontal. Girar o aparelho com o editor aberto atualiza o enquadramento; fechar devolve a distância anterior da câmera.

Verificação: `node --test tests/missions.test.mjs tests/missions-network.test.mjs`; para interface, iniciar `LOWKEY_PREVIEW_PORT=4214 node tests/preview-startup.mjs` e executar `node tests/mobile-review.cjs`. Este último usa contas descartáveis, quatro tamanhos de tela, rotação e três toques simultâneos; não substitui uma rodada em aparelhos reais.

## Trabalhos legais e clandestinos

Em **ATIVIDADES**, selecione entregas legais ou o trabalho clandestino da favela. O contato Zeca fica em um ponto fixo e acessível do Bairro Keylow: selecione o trabalho para marcar o contato no mapa, vá até ele e aceite o contrato. Desça do veículo para pegar a cota fictícia e entregar ao destinatário sorteado. Legal e clandestino têm reputação independente e persistente, com níveis nos marcos de 0, 5, 15 e 30 conclusões. Os limites de distância liberados são 180, 320, 550 m e depois o mapa inteiro; o contrato clandestino paga 50% a mais no nível inicial e o adicional cresce 15 pontos percentuais por nível. Entregas legais mantêm o pagamento base por distância. O sistema agora sorteia pontos ao longo da extensão real das ruas, incluindo centro alto, vila rural, mansões e os dois aeroportos.

Aceitar não gera estrelas. A batida frontal com viatura enquanto carrega carga clandestina mantém a regra de duas estrelas; a regra especial não se aplica ao pacote legal. Morte, prisão, Zombies ou expiração cancelam a carga sem pagamento, sem remover saldo e reputação já conquistados. O servidor valida proximidade, identidade, etapas, recompensa e conclusão única. Saldo e entregas antigos migram para a carreira legal. Os contatos são modelos locais limitados a dois durante a missão (um no ponto de contratação quando o trabalho clandestino está selecionado), reaproveitados entre consultas e removidos ao trocar/cancelar; não há novo ciclo de IA.

Esta primeira etapa é de contratos com uma retirada e uma entrega. Rotas de múltiplas entregas, trabalhos em equipe, táxi, pesca, compras e propriedade de veículos continuam para etapas seguintes. Verificação: `node --test tests/careers.test.mjs tests/missions.test.mjs tests/missions-network.test.mjs tests/races-club.test.mjs`; interface em prévia isolada na porta 4215: `node tests/careers-browser.cjs` (respostas simuladas só para UI; proximidade e pagamentos são testados também pela API real).

## Corridas e Velvet Club

Abra **ATIVIDADES → CORRIDAS**, escolha Circuito da Praça, Volta da Cidade ou Sprint do Litoral e siga a largada no mapa. Use carro ou moto como motorista. Há contagem de cinco segundos, portais azuis e checkpoints automáticos em ordem. Esta primeira versão é contra o relógio, com recordes pessoais por circuito e tipo de veículo, prêmio em LK$ e intervalo de trinta segundos. Reconectar preserva a corrida enquanto válida; morte, prisão e Zombies cancelam. O servidor valida motorista, veículo, posição e tempo mínimo por trecho; a recompensa não vem do cliente.

O **Velvet Club** fica no prédio perto da orla, a leste do acesso ao píer (x=16, z=108), marcado com **B** no mapa. Térreo com lounge, bar e palco, dois personagens adultos com o mesmo rosto, cabelo, silhueta e membros articulados dos avatares femininos do jogo, biquínis opacos, movimento simples não explícito e iluminação neon. A escada à esquerda leva ao motel com três suítes decoradas. Pisos, paredes e escada compartilham geometria de colisão; o térreo não sobe automaticamente ao piso superior. Personagens e luzes do clube só ficam ativos de perto; não há IA adicional no servidor, nudez ou interações sexuais.

Testes: `node --test tests/races-club.test.mjs tests/city.test.mjs tests/missions.test.mjs tests/missions-network.test.mjs`. `tests/races-club-browser.cjs` confere seletor e renderização dos interiores na prévia isolada 4214; `tests/mobile-review.cjs` revisa quatro telas móveis, rotação e multitouch.

## Limitações gerais

### Prévia das ilhas — expansão do mapa

A praça central foi ampliada um quarteirão em cada direção: ruas laterais em x=±60 e z=±64, área segura alinhada às calçadas, conveniências recuadas para a faixa seguinte. Garagem, boutique e delegacia mantêm seus serviços, mas mudaram de posição; Velvet Club, praia, parque e marina permanecem no lugar. A base original se conecta a um prolongamento ao norte, à Ilha do Porto a oeste e a uma ilhota no canal. Três pontes têm tabuleiro a 9,2 m, rampas contínuas, guarda-corpos e pilares somente no canal. Carros e motos passam por baixo nas ruas transversais sem subir automaticamente; barcos também passam, sem a câmera saltar para o tabuleiro. O mapa do celular/PC mostra as ilhas, pontes e serviços reposicionados.

Esta é uma base jogável em etapas. O desenho aprovado agora tem dois aeroportos (sul da ilha oeste e ponta norte da ilha principal), pistas, pátios, terminais externos e torres; heliporto no centro alto da ilha oeste, prédios altos ao norte, uma favela com 54 casas de tamanhos, alturas, cores e telhados variados no miolo, zona rural com plantações ao sul e mansões no prolongamento norte da ilha principal. Um campinho com traves e marcações divide um dos lotes com seis casas; ainda não há partida ou física de bola. O mapa identifica esses bairros. São exteriores estáticos: ainda não há aviões/helicópteros, interiores dos terminais ou missões aeroportuárias. O morro com relevo e a estátua Keylow ainda não fazem parte desta etapa.

O palco principal de festival tem deck de 50×18 m, fachada de aproximadamente 78 m, cobertura alta em quatro módulos inclinados e torres de LED integradas nas laterais. O telão principal 16:9 de 24×13,5 m fica no fundo do palco, sob a cobertura — não é um outdoor acima dela. Passarela central com ponta em T, duas escadas, treliças e caixas de som suspensas. Mantém o mesmo player e fila sincronizada já existentes, com projeção calculada pela geometria real do telão; os painéis laterais são decorativos, sem players adicionais. A distância de áudio é calculada a partir da frente do palco. Quatro luzes próximas, oito fachos animados e oito jatos visuais de fogo usam conjuntos fixos, desativados à distância; fogo não causa dano. Não foram adicionados NPCs nem aumentados os limites da polícia. Pontos de embarque separados na rua em frente à delegacia permitem remontar equipes após a mudança do prédio. O chão usa consulta por células no servidor, construções continuam agrupadas em instâncias e o mar mantém a malha detalhada original com um anel distante leve.

A área do público está livre dos bancos e dos dois veículos iniciais da praça; as colisões antigas também foram removidas. Os quatro postes decorativos ficam nos quatro cantos do piso, com bases na altura dele e posições compartilhadas por cliente e servidor. Carros/motos continuam disponíveis na garagem, com reposição normal; barcos/jets permanecem na marina.

Prévia isolada: `LOWKEY_PREVIEW_PORT=4215 node tests/preview-startup.mjs` (no PowerShell, definir a variável de ambiente primeiro). Em localhost, `/?preview=islands` abre a vista aérea, `/?preview=bridges` mostra a ponte central e `/?preview=explore` cria uma conta descartável para explorar. Esses modos não liberam login em domínios online; a conta só é descartável quando usada no servidor isolado de testes.

Prévia de detalhes em localhost: `/?preview=airport-west`, `/?preview=airport-main`, `/?preview=festival`, `/?preview=downtown`, `/?preview=favela`, `/?preview=rural` e `/?preview=mansions`, sem login. Verificações: `node --test tests/districts.test.mjs tests/islands.test.mjs tests/city.test.mjs tests/coast.test.mjs tests/motion-sync.test.mjs tests/watercraft.test.mjs tests/stage.test.mjs` e `node tests/islands-browser.cjs`. `node tests/police-performance.mjs` mede o custo da IA em simulações locais, não o ping/FPS de produção.

Na versão local, a sala multiplayer funciona na rede local/Wi-Fi; para sócios em outros lugares, use a cópia hospedada com HTTPS. Não compartilhe a porta diretamente com a internet. O modo direto local usa STUN e pode falhar em redes restritivas. A voz do site público é desabilitada até o SFU central estar configurado. Contas e avatares persistem, mas mensagens e posições da sala somem quando o servidor reinicia. Ainda não há recuperação de senha ou moderação. A sincronização de movimento é simples e adequada para testar o conceito, não é proteção contra trapaças.

### Metrópole neon e penitenciária — primeira etapa local

Revisão de integração: o modo Zombies nasce perto dos participantes em terra firme em ambas as cidades, sem o antigo limite fixo de 42m. Praça segura continua sem ataques: zumbis não nascem nem entram nela. Cascos verificam a profundidade da areia submersa, permitindo jet em água profunda sem atravessar areia rasa, píer ou pilares. Embarque, voz e saída do carrossel também são verificados pelo servidor. A pose da mão de apoio é recalculada apenas quando a arma muda, evitando alocações repetidas por quadro.

O centro mantém a praça, palco e serviços existentes, mas suas casas genéricas foram substituídas por torres de 7–18 andares. Prefeitura e hospital são marcos exteriores, ainda sem atendimento ou interiores. Há doze mansões maiores (duas por lote), dois postos cenográficos, mais árvores, LEDs de rua/ponte e até doze anúncios fictícios alternando a cada três segundos, sem vídeos externos ou tráfego de rede. Os anúncios só atualizam de perto; as luzes reais continuam limitadas aos conjuntos anteriores.

As três pontes ganharam torres duplas, arcos altos, passarela e cabos inspirados na referência. Colisões ficam fora da pista ou acima da altura de passagem. Contornos das ilhas usam subdivisão determinística; a praia frontal tem dunas baixas e descida até areia submersa, com a mesma altura no cliente, servidor e rastros. A base das ilhas chega a oito metros abaixo do nível do terreno e o cenário marinho tem fundo a 26 metros: ainda não há mergulho, ecossistema submarino ou relevo montanhoso completo.

O monumento tem escala quatro vezes maior. O píer tem duas alas laterais, áreas sinalizadas para pesca (sem a mecânica de pescar) e carrossel de doze lugares individuais, com embarque/saída nas pausas, posições sincronizadas e renderização agrupada. Pavilhões rurais têm portas abertas, vegetação e pacotes cenográficos de mercadoria clandestina; não há fabricação ou receita de drogas.

Capturados vão ao pátio da nova ilha penitenciária. Pena: 60s + 8s por ponto de crime + 40s por policial morto + 1s por mil do valor roubado, limitada a dez minutos. Atualmente o valor roubado contabilizado é o roubo concluído de veículo ocupado: 25.000 para carro e 9.000 para moto, valores fictícios de referência (pegar estoque gratuito na loja não é roubo). Três tarefas alternam no pátio; aproximar-se do anel, clicar em Trabalhar e permanecer por oito segundos desconta quinze segundos. Servidor valida conta, posição, tempo, ordem e conclusão única; afastar-se cancela o trabalho. Armas, veículos e saída do pátio ficam bloqueados. Liberação devolve o jogador à entrada da delegacia. A pena sobrevive à reconexão, mas ainda é estado de sala em memória: reiniciar o servidor ou usar reset limpa a prisão.

Novos modelos famosos de carros/motos, helicópteros/aviões pilotáveis, morros e relevo completo, interiores cívicos e abastecimento ficam para etapas seguintes. Nada desta etapa é publicado automaticamente. Prévia `/?preview=prison` mostra a ilha; `/?preview=islands` mostra o conjunto. Testes novos: `tests/metropolis.test.mjs` e `tests/metropolis-browser.cjs`.

O protótipo usa Three.js 0.160.0, biblioteca 3D sob licença MIT. O aviso está em `THREE-LICENSE.txt`.
