"use client";

import { useEffect, useRef } from "react";

/* ---------------------------------------------------------------------------
   Constelação animada — o fundo do herói da página de apresentação.

   Uma nuvem de pontos distribuídos numa esfera, rodada devagar em três
   dimensões e projectada com perspectiva. Os pontos que ficam perto uns dos
   outros no ecrã ligam-se por uma linha, e tanto a linha como o ponto ficam
   mais claros quanto mais à frente estiverem. É daí que vem a sensação de
   volume: não há profundidade nenhuma desenhada, só brilho a variar com o `z`.

   ESTA PÁGINA NÃO TINHA JAVASCRIPT NENHUM, e é a única do produto assim — foi
   feita como componente de servidor para chegar pronta a quem a encontra numa
   pesquisa ou a abre com rede fraca. Este ficheiro é a excepção, e paga-se
   barata: o texto, os botões e os dados estruturados continuam a vir do
   servidor e a página está inteira e legível antes de isto correr. Se o
   JavaScript falhar, fica o gradiente por baixo e mais nada muda.

   Três travões, porque um fundo bonito não justifica gastar bateria: pára
   quando o separador deixa de estar à vista, pára quando o herói sai do ecrã,
   e com `prefers-reduced-motion` pinta UM fotograma e não volta a correr — em
   vez de não pintar nada, que deixaria o herói vazio a quem pediu menos
   movimento.
--------------------------------------------------------------------------- */

type Cor = readonly [number, number, number];

/** Uma família de cor, com o tom de frente e o de trás. */
type Familia = { perto: Cor; longe: Cor };

type No = {
  ox: number;
  oy: number;
  oz: number;
  tamanho: number;
  brilho: number;
  familia: Familia;
};

/** Ponto já rodado e projectado no plano do ecrã. */
type Projeccao = {
  x: number;
  y: number;
  z: number;
  tamanho: number;
  brilho: number;
  familia: Familia;
};

/* DUAS FAMÍLIAS, e é a razão de este ficheiro ter mudado depois de pronto.
   Com uma só, o herói era uma mancha azul — o mesmo problema que o resto da
   página tinha. O azul é o da marca (`--color-acento` e o seu tom claro); o
   rosa vem da paleta do Piloto, onde estava declarado e por usar. Fica em
   minoria: cerca de dois em cada sete pontos. */
const AZUL: Familia = { perto: [111, 163, 236], longe: [61, 127, 224] };
const ROSA: Familia = { perto: [255, 143, 196], longe: [206, 55, 132] };

const VELOCIDADE = 0.00008; // radianos por milissegundo

/** A cor de um ponto à profundidade dada — 0 ao fundo, 1 à frente. */
function tom(familia: Familia, frente: number): Cor {
  const { perto, longe } = familia;
  return [
    Math.round(longe[0] + (perto[0] - longe[0]) * frente),
    Math.round(longe[1] + (perto[1] - longe[1]) * frente),
    Math.round(longe[2] + (perto[2] - longe[2]) * frente),
  ];
}

function criarNos(quantos: number): No[] {
  return Array.from({ length: quantos }, (_, i) => {
    // Distribuição uniforme na esfera: o `acos` é o que evita os pontos
    // acumularem-se nos pólos, que é o que acontece se se sortear o ângulo
    // vertical directamente.
    const teta = Math.random() * Math.PI * 2;
    const fi = Math.acos(2 * Math.random() - 1);
    const raio = 0.35 + Math.random() * 0.65;
    return {
      ox: Math.sin(fi) * Math.cos(teta) * raio,
      oy: Math.sin(fi) * Math.sin(teta) * raio,
      oz: Math.cos(fi) * raio,
      tamanho: 1.1 + Math.random() * 2,
      brilho: 0.4 + Math.random() * 0.6,
      // Pelo índice e não à sorte: com quarenta pontos, um sorteio pode sair
      // sem rosa nenhum e o efeito perde metade da graça.
      //
      // Dois em cada cinco, e o número foi medido e não escolhido: com dois em
      // sete, os pares azul-azul eram metade das linhas e o rosa não chegava a
      // 8% do que se pinta — lia-se na mesma como um herói azul. Assim as
      // linhas mistas passam a ser a maioria, e são elas que dão o violeta que
      // liga as duas famílias.
      familia: i % 5 < 2 ? ROSA : AZUL,
    };
  });
}

export default function ConstelacaoAnimada() {
  const referencia = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const tela = referencia.current;
    const pincel = tela?.getContext("2d");
    const secao = tela?.parentElement;
    if (!tela || !pincel || !secao) return;

    // As três constantes repetem as referências de cima com o tipo já sem
    // `null`. O TypeScript não leva o estreitamento para dentro das funções
    // declaradas mais abaixo — sem isto seria um `!` em cada linha que toca no
    // contexto, e um `!` a mais é o que esconde um erro a sério.
    const canvas: HTMLCanvasElement = tela;
    const ctx: CanvasRenderingContext2D = pincel;
    const molde: HTMLElement = secao;

    const sobrio = window.matchMedia("(prefers-reduced-motion: reduce)");

    let largura = 0;
    let altura = 0;
    let nos: No[] = [];
    let anguloY = 0;
    let ultimo: number | null = null;
    let pedido: number | null = null;
    let aVista = true;

    function medir() {
      // O ecrã do telemóvel tem três vezes os pontos do de secretária e o
      // desenho não ganha nada com isso — dois chega e sobra.
      const densidade = Math.min(window.devicePixelRatio || 1, 2);
      largura = molde.clientWidth;
      altura = molde.clientHeight;
      canvas.width = Math.round(largura * densidade);
      canvas.height = Math.round(altura * densidade);
      ctx.setTransform(densidade, 0, 0, densidade, 0, 0);

      // As ligações são o que custa: são pares, e o custo sobe ao quadrado do
      // número de pontos. Noventa dão 4005 pares por fotograma num ecrã largo;
      // num telemóvel, quarenta dão 780 e o desenho continua a ler-se.
      const quantos = largura < 640 ? 40 : largura < 1024 ? 65 : 90;
      if (nos.length !== quantos) nos = criarNos(quantos);
    }

    function projectar(): Projeccao[] {
      const anguloX = 0.28 + Math.sin(anguloY * 0.3) * 0.12; // balanço lento
      const cosY = Math.cos(anguloY);
      const sinY = Math.sin(anguloY);
      const cosX = Math.cos(anguloX);
      const sinX = Math.sin(anguloX);

      // A distância da câmara é MAIOR do que o raio da esfera de propósito: se
      // for menor, os pontos que passam à frente do observador projectam-se
      // com escala negativa e atravessam o ecrã em riscos.
      const foco = Math.min(largura, altura) * 0.85;
      const distancia = 1.9;

      return nos.map((n) => {
        const x1 = n.ox * cosY - n.oz * sinY;
        const z1 = n.ox * sinY + n.oz * cosY;
        const y = n.oy * cosX - z1 * sinX;
        const z = n.oy * sinX + z1 * cosX;
        const escala = foco / (distancia - z);
        return {
          x: largura / 2 + x1 * escala,
          y: altura / 2 + y * escala,
          z,
          tamanho: n.tamanho,
          brilho: n.brilho,
          familia: n.familia,
        };
      });
    }

    function pintar() {
      const pontos = projectar();
      const ligacao = Math.min(largura, altura) < 520 ? 150 : 240;
      ctx.clearRect(0, 0, largura, altura);

      // As linhas primeiro, para os pontos ficarem por cima delas.
      ctx.lineWidth = 0.8;
      for (let i = 0; i < pontos.length; i++) {
        for (let j = i + 1; j < pontos.length; j++) {
          const a = pontos[i];
          const b = pontos[j];
          const afastamento = Math.hypot(a.x - b.x, a.y - b.y);
          if (afastamento > ligacao) continue;

          const frente = ((a.z + b.z) / 2 + 1) / 2;
          const opacidade = (1 - afastamento / ligacao) * frente * 0.42;

          // A linha fica na média das cores das duas pontas: entre um ponto
          // azul e um rosa sai um violeta, e é isso que faz as duas famílias
          // parecerem a mesma constelação em vez de duas sobrepostas.
          const ca = tom(a.familia, frente);
          const cb = tom(b.familia, frente);
          const vermelho = (ca[0] + cb[0]) >> 1;
          const verde = (ca[1] + cb[1]) >> 1;
          const azul = (ca[2] + cb[2]) >> 1;

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${vermelho},${verde},${azul},${opacidade})`;
          ctx.stroke();
        }
      }

      for (const p of pontos) {
        const frente = (p.z + 1) / 2;
        const opacidade = p.brilho * frente;
        const raio = p.tamanho * (0.5 + frente * 0.8);

        const [hr, hg, hb] = p.familia.perto;
        const halo = ctx.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          raio * 3.5,
        );
        halo.addColorStop(0, `rgba(${hr},${hg},${hb},${opacidade * 0.65})`);
        halo.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
        ctx.beginPath();
        ctx.arc(p.x, p.y, raio * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        // O núcleo é quase branco, com um travo da própria família: é o que o
        // faz ler como luz e não como um ponto pintado.
        const nucleo = tom(p.familia, 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, raio, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${(nucleo[0] + 255 * 3) >> 2},${(nucleo[1] + 255 * 3) >> 2},${(nucleo[2] + 255 * 3) >> 2},${opacidade})`;
        ctx.fill();
      }
    }

    function passo(instante: number) {
      if (ultimo === null) ultimo = instante;
      // Um separador que esteve escondido volta com um salto no relógio.
      // Limitar o passo evita a esfera dar meia volta de repente.
      anguloY += VELOCIDADE * Math.min(instante - ultimo, 50);
      ultimo = instante;
      pintar();
      pedido = requestAnimationFrame(passo);
    }

    function arrancar() {
      if (pedido !== null || sobrio.matches) return;
      ultimo = null;
      pedido = requestAnimationFrame(passo);
    }

    function parar() {
      if (pedido === null) return;
      cancelAnimationFrame(pedido);
      pedido = null;
    }

    function conforme() {
      if (aVista && document.visibilityState === "visible") arrancar();
      else parar();
    }

    function aoRedimensionar() {
      medir();
      if (pedido === null) pintar();
    }

    function aoMudarPreferencia() {
      parar();
      // Com movimento reduzido fica o fotograma parado; sem ele, volta a andar.
      if (sobrio.matches) pintar();
      else conforme();
    }

    medir();
    pintar();

    const observadorTamanho = new ResizeObserver(aoRedimensionar);
    observadorTamanho.observe(molde);

    const observadorVista = new IntersectionObserver(
      ([entrada]) => {
        aVista = entrada.isIntersecting;
        conforme();
      },
      { threshold: 0 },
    );
    observadorVista.observe(molde);

    document.addEventListener("visibilitychange", conforme);
    sobrio.addEventListener("change", aoMudarPreferencia);
    conforme();

    return () => {
      parar();
      observadorTamanho.disconnect();
      observadorVista.disconnect();
      document.removeEventListener("visibilitychange", conforme);
      sobrio.removeEventListener("change", aoMudarPreferencia);
    };
  }, []);

  return (
    // O `aria-hidden` vai na caixa e não no `canvas`: o `canvas` conta como
    // elemento interactivo, e esconder de um leitor de ecrã algo onde se pode
    // chegar com o teclado deixa quem lá chega sem nada dito. A caixa não é
    // focável, e esconde o que tem dentro — que é decoração e mais nada.
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <canvas ref={referencia} className="size-full opacity-90" />
    </div>
  );
}
