<p align="center">
  <img src="BiocracyEngine_matrixlogo.png" alt="BiocracyEngine" width="800">
</p>

<p align="center"><em>retroalimentación cibernética → parlamento multiespecie</em></p>

**Español** · [English](README.en.md)

# BiocracyEngine

BiocracyEngine es un instrumento audiovisual en vivo. Une tres fuentes en un solo bucle de retroalimentación:

- **El bosque:** grabaciones AudioMoth de un bosque seco tropical (Reserva Manakai, Planeta Rica, Córdoba, Colombia).
- **La cadena:** transacciones de Ethereum en vivo.
- **La asamblea:** un parlamento multiespecie de especies, personas y máquinas.

Cada parámetro cambia el sonido (SuperCollider) y la imagen (navegador) al mismo tiempo.

![Slot F · DarkForest: el bosque de la Reserva Manakai como paisaje de datos en vivo.](BEngine.jpg)

## Principios

- **Opacidad:** El sistema no muestra algunos nombres de especies. Su sonido se queda.
- **Ausencia:** Un día sin grabación no está vacío. Suena como una señal débil.
- **Tiempo fenológico:** El calendario del bosque controla la síntesis.
- **BioToken:** Un BioToken registra presencia y cuidado. No se puede vender.
- **Parlamento:** Los mismos sensores pueden vigilar o pueden dar voz. La estructura de poder decide cuál.

## Cómo funciona

```
Ethereum ─► eth_sonify.py ─OSC─► SuperCollider ─OSC─► parliament-bridge.js ─WS─► navegador
Corpus AudioMoth ────────────────►      │
Faderfox LC2 (MIDI) ─────────────►      └─► audio
```

SuperCollider guarda el valor de cada parámetro. El navegador, la GUI de SC y el MIDI envían sus cambios por la misma ruta. Todos reciben el mismo eco.

## La composición en la cúpula

Para el Domo del Planetario de Bogotá, el motor arranca en su mezcla de cúpula (MEZCLA en 1).

- **Las capas principales llenan el espectro y la sala.** Cada una tiene su altura en el espectro y su lugar en los cuatro canales:
  - el bombo es el piso;
  - el drone es la tierra, alrededor y hacia el frente;
  - el pad es una lámina pareja que respira de adelante hacia atrás;
  - el dust es el aire, atrás y arriba.
- **Las demás capas tienen un sitio propio.**
  - El bosque (corpus) envuelve los lados y la espalda, como un lugar envuelve a quien escucha.
  - ULTRA llega desde atrás.
  - GOLPE está en el escenario.
  - Cada motor tiene su casa en el anillo. Cuando crece, se acerca al frente y luego vuelve.
- **PERC y KICK son un hsaing waing birmano.**
  - BOWL es el círculo afinado: gongs en el golpe largo y tambores pat waing en el corto.
  - CHINA son los platillos linkwin y si.
  - KICK es el pat ma, el gran tambor, con el wa de bambú.
  - Las notas caen en una pentatónica sobre la raíz del drone. Cada golpe suena desde el lugar del anillo que le da su altura, así que una escala camina alrededor de la sala.
- **El módulo C en la cúpula.** Las cámaras trampa se ven en una pantalla curva que sigue el borde del domo y gira despacio, para que cada asiento las vea de frente. Detrás está la Biblioteca de Babel: galerías hexagonales que suben sin fin, con las 30 capturas y los 612 espectrogramas como libros, y cada galería gira por su cuenta.
- **Los módulos 5 a 9 giran cada uno a su manera.** ROTATION SPD va de −2 a +2: el centro detiene y la izquierda invierte.

MEZCLA en 0 (la configuración MEZCLA_0_Barro) devuelve el sonido de antes, todo al frente.

## Arranque

Necesita Node.js, Python 3 y SuperCollider (macOS o Linux).

1. Instale los paquetes de Python:
   ```bash
   python3 -m venv eth_listener/venv && source eth_listener/venv/bin/activate && pip install web3 python-osc
   ```
2. Arranque todos los procesos:
   ```bash
   ./start_ecosystem.sh
   ```
   Para la proyección láser, use `LASER=1 ./start_ecosystem.sh`.
3. Espere `=== CONTROL BUS SETUP COMPLETE ===` en `sclang_log.txt`. El motor está listo.
4. El script abre `http://localhost:9001/parliament.html`. Pulse una tecla (0–9, letras) para cambiar el módulo visual.

## Documentación

| Tema | Documento |
|---|---|
| Teoría y principios | [Fundamentos](docs/es/fundamentos.md) |
| Cómo escucha: algoritmos y tesis doctoral (Domo del Planetario, 21 oct 2026) | [Escucha](docs/es/escucha.md) |
| Procesos, puertos, flujo de datos | [Arquitectura](docs/es/arquitectura.md) |
| Módulos visuales y teclas | [Módulos](docs/es/modulos.md) |
| Parámetros, mezclador, corpus | [Controles y sonido](docs/es/controles.md) |
| Proyección láser y seguridad | [Láser](docs/es/laser.md) |
| Cúpula de planetario y render | [Cúpula](docs/es/cupula.md) |
| Requisitos y monitor | [Diagnóstico](docs/es/diagnostico.md) |
| Cambios | [CHANGELOG](CHANGELOG.md) |

## Licencia

MIT
