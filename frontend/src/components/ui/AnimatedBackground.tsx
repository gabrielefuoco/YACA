"use client";

import { useEffect, useRef } from "react";

/**
 * Sfondo: un campo di colore continuo calcolato per pixel.
 *
 * Perche' uno shader e non gradienti CSS: ogni gradiente ha un bordo, e l'occhio
 * trova il bordo. Il rumore a bassissima frequenza non ne ha, quindi la luce si
 * muove senza che si veda "cosa" si muove.
 *
 * Vincoli che questo file deve rispettare:
 * - 30 fps, non 60: sopra i 30 non si vede la differenza e si consuma il doppio;
 * - si ferma quando la scheda non e' visibile (nessun frame sprecato in background);
 * - `prefers-reduced-motion: reduce` disegna UN frame e si ferma: chi ha il
 *   movimento ridotto attivo vede lo sfondo, non un'animazione;
 * - senza WebGL resta il beige del <body>: degrado silenzioso ma innocuo.
 */

const SPEED = 0.375;
const MAX_DPR = 1.5;
const MIN_FRAME_MS = 33;

const VERTEX = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }`;

const FRAGMENT = `
precision mediump float;
uniform vec2 res;
uniform float time;
float hash(vec2 p){ p=fract(p*vec2(127.1,311.7)); p+=dot(p,p+34.5); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0., a=.5;
  for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(13.7,7.1); a*=.5; }
  return v;
}
void main(){
  vec2 uv=gl_FragCoord.xy/res;
  vec2 p=(uv-.5)*vec2(res.x/res.y,1.0)*2.4;
  float t=time;
  vec2 drift=vec2(sin(t*.31)+.4*sin(t*.17), cos(t*.23)-.3*sin(t*.13));
  p += drift*.55;
  vec2 q=vec2(fbm(p*.62+vec2(t*.24,-t*.19)), fbm(p*.62+vec2(8.3+t*.21,2.7-t*.25)));
  vec2 r=vec2(fbm(p*.55+2.1*q+vec2(-t*.23,t*.17)), fbm(p*.55+2.1*q+vec2(3.4+t*.19,-5.1-t*.22)));
  float cloud=fbm(p*.72+2.4*r+vec2(t*.20,-t*.16));
  float haze=fbm(p*.34+1.5*q+vec2(-t*.12,t*.10));
  float light=smoothstep(.34,.60,cloud*.62+haze*.38);
  float breath=.5+.5*sin(t*.31+cloud*5.0+haze*3.0);
  float topRight=1.0-smoothstep(.12,1.55,length((uv-vec2(.78,.88))*vec2(res.x/res.y,1.0)));
  float cream=clamp(.03 + .72*light + .13*topRight + .18*breath*light, 0.0, .92);
  float warm=clamp(.03 + .20*(1.0-light)*haze + .14*(1.0-uv.y)*cloud, 0.0, .24);
  vec3 base=vec3(238.,217.,185.)/255.;
  vec3 ivory=vec3(248.,232.,203.)/255.;
  vec3 terracotta=vec3(110.,45.,22.)/255.;
  vec3 color=mix(base,ivory,cream);
  color=mix(color,terracotta,warm);
  gl_FragColor=vec4(color,1.);
}`;

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return; // resta il beige del body

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("shader");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || "compile");
      }
      return shader;
    };

    let raf = 0;
    let start = performance.now();
    let last = 0;

    try {
      const program = gl.createProgram();
      if (!program) throw new Error("program");
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "link");
      }
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const loc = gl.getAttribLocation(program, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const uRes = gl.getUniformLocation(program, "res");
      const uTime = gl.getUniformLocation(program, "time");

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const w = Math.max(1, Math.round(window.innerWidth * dpr));
        const h = Math.max(1, Math.round(window.innerHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
      };

      const draw = (seconds: number) => {
        resize();
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, seconds * SPEED);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      draw(0);
      if (reduced) {
        // Un solo fotogramma: lo sfondo c'e', l'animazione no.
        resize();
        return () => gl.getExtension("WEBGL_lose_context")?.loseContext();
      }

      const loop = (now: number) => {
        if (now - last >= MIN_FRAME_MS) {
          last = now;
          draw((now - start) / 1000);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onResize = () => draw((performance.now() - start) / 1000);
      const onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
        } else {
          start = performance.now() - last;
          raf = requestAnimationFrame(loop);
        }
      };
      window.addEventListener("resize", onResize);
      document.addEventListener("visibilitychange", onVisibility);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("visibilitychange", onVisibility);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch {
      // Shader non compilato: resta il beige del <body>, nessun errore a schermo.
      return () => gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
