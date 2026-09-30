# LowKey — Praça 001 · Multiplayer LAN

Primeira sala compartilhada do protótipo social LowKey. O servidor é leve, usa apenas recursos nativos do Node.js e não exige instalar pacotes.

## Abrir a sala

1. Extraia o ZIP inteiro para uma pasta.
2. Instale Node.js 20 ou mais recente no computador que vai hospedar a sala.
3. Abra `INICIAR-SALA.bat` e aceite acesso à rede privada se o Windows perguntar.
4. No navegador do computador anfitrião, abra `http://localhost:4173`.
5. A janela do servidor mostra também um endereço de rede, por exemplo `http://192.168.0.15:4173`. Envie esse endereço às pessoas conectadas ao mesmo Wi-Fi.
6. Cada pessoa abre o endereço no Edge ou Chrome e clica em **Começar · Capturar mouse**. No teste local, a voz funciona em `localhost`; para outros aparelhos na rede ou pela internet, use o endereço HTTPS hospedado.

A sala existe enquanto a janela do servidor estiver aberta. O servidor precisa ficar ligado; não feche a janela durante a sessão.

## Preparar teste pela internet

O arquivo `render.yaml` configura o servidor Node como serviço web gratuito no Render. O projeto é publicado pelo repositório Git conectado ao serviço. A sala de teste está em https://lowkey-social-mvp-test.onrender.com/ e não exige login: quem tiver o endereço consegue entrar. A sala e as mensagens existem só na memória e são apagadas quando o serviço reinicia.

## Controles

- **WASD** ou setas: andar
- **Shift**: correr
- **Espaço**: pular; segure para encadear bunny hops. WASD controla a direção no ar e ajuda a manter o impulso.
- **Beirada da ilha**: cair no vazio; o personagem volta a surgir no alto da praça
- **Roda do mouse**: aproximar até entrar em primeira pessoa ou afastar para terceira pessoa
- **Mover o mouse depois de Começar**: olhar/girar a câmera sem arrastar
- **Esc**: liberar o cursor para voltar aos painéis
- **Painel à direita**: mudar nome, pele, cabelo, camiseta, calça, capuz e chave
- **Chat abaixo à esquerda**: mensagens compartilhadas por todos na sala
- **Ativar voz**: permita o microfone; o jogo transmite sua voz pelo serviço central quando o SFU estiver configurado. Só jogadores a até 12 unidades recebem seu áudio. Clique de novo para desligar.

O navegador pedirá permissão do microfone. A voz fica aberta enquanto o botão estiver ativo; use-o de novo para mutar e desconectar. No site público, a voz centralizada só fica ativa quando as credenciais do SFU estiverem configuradas no Render. Em `localhost`, sem credenciais, o jogo mantém o modo direto de teste.

## Configurar voz centralizada no Render

1. No painel da Cloudflare, crie uma aplicação em **Realtime → Serverless SFU** e copie o App ID e o App Secret.
2. No Render, abra o serviço `lowkey-social-mvp-test` → **Environment** e adicione `CF_SFU_APP_ID` e `CF_SFU_APP_SECRET` com esses valores. Salve e aguarde o serviço reiniciar.
3. Atualize o jogo. O status da voz deve indicar **VOZ CENTRAL** quando conectar.

Não coloque o App Secret neste repositório nem o envie no chat. O segredo só é usado pelo servidor Node do Render. A Cloudflare inclui 1.000 GB por mês de tráfego de saída para Realtime SFU/TURN; acima disso, a tarifa publicada é US$ 0,05 por GB. Consulte [preços oficiais](https://developers.cloudflare.com/realtime/sfu/pricing/) antes de abrir o teste para muita gente.

## O que já dá para experimentar

Uma praça 3D blocada flutua no céu, com camadas visíveis de terra e pedra sob o gramado, sem paredes ou limite invisível de caminhada. O jogador entra caindo do alto; ao sair da ilha, cai no vazio e reaparece acima da praça. O cenário tem iluminação solar e de preenchimento, sombras suaves e sombras de contato, portal de entrada, árvores, flores, vaga-lumes, palco, bancos, luminárias e um marco em forma de chave. Jogadores conectados usam o mesmo modelo e escala de avatar, com nome, aparência, posição, caminhada e salto sincronizados; os movimentos remotos são interpolados para ficarem mais fluidos, e a pose de pulo é igual para o jogador local e os demais. O contador de pessoas online é compartilhado. O chat de texto e a voz usam o mesmo raio de 12 unidades. Com o SFU configurado, os navegadores publicam e recebem a voz pelo serviço central; o segredo da Cloudflare fica apenas no servidor Render. Sem credenciais, o site público desativa voz e o teste local em `localhost` mantém o modo direto. O movimento lateral acompanha a direção visual da câmera: **A/← para a esquerda** e **D/→ para a direita**; aceleração e parada são graduais.

## Limites desta versão

Na versão local, a sala multiplayer funciona na rede local/Wi-Fi; para sócios em outros lugares, use a cópia hospedada com HTTPS. Não compartilhe a porta diretamente com a internet. O modo direto local usa STUN e pode falhar em redes restritivas. A voz do site público é desabilitada até o SFU central estar configurado, para não indicar falsamente que todos estão conectados. Não há contas, persistência ou moderação; os dados da sala somem quando o servidor reinicia. A sincronização de movimento é simples e adequada para testar o conceito, não é proteção contra trapaças.

O protótipo usa Three.js 0.160.0, biblioteca 3D sob licença MIT. O aviso está em `THREE-LICENSE.txt`.
