#!/usr/bin/env python3
"""make_placeholders.py — reconstruye el árbol de corpus/ y recordings/ vacío.

Los audios reales no están en el repositorio y no van a estarlo: el corpus
derivado pesa ~4.2 GB y las dos sesiones del motor 450 MB. Pero sus RUTAS sí
importan — son las que leen 14_phenological_corpus.scd, 16_corpus_calls.scd y
web/build_media.sh — y sin ellas no hay forma de saber, leyendo el repositorio,
qué archivos espera encontrar el motor ni cómo se llaman.

Esto crea cada ruta como archivo vacío, SÓLO en el disco y sólo si falta:
nunca pisa un archivo que ya existe. Los vacíos no se versionan (ver
.gitignore): cuando se versionaban, cambiar a una rama que los seguía pisaba el
corpus real con ellos, porque git trata como prescindible lo que ignora.

Las rutas del corpus NO se inventan ni se leen del disco —que puede no estar
montado— sino que salen de corpus/manifest.json, que es exactamente lo que el
motor abre en tiempo de ejecución. Si el manifiesto cambia, esto lo sigue.

    python3 tools/make_placeholders.py            # crea lo que falte
    python3 tools/make_placeholders.py --check    # sólo informa, no escribe
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CHECK = "--check" in sys.argv

# Las dos sesiones grabadas del motor, de las que salen las cinco composiciones
# de la web. Nombre, duración real y de dónde salió cada composición.
RECORDINGS = [
    ("eth_sonification_20260922_111301.wav", "415 s · 4 canales · 24 bit / 48 kHz",
     "lecho (95-155 s) · enjambre (160-220 s) · ascenso (285-345 s)"),
    ("eth_sonification_20260922_112003.wav", "397 s · 4 canales · 24 bit / 48 kHz",
     "meseta (165-225 s) · retorno (260-320 s)"),
]


def touch(rel: pathlib.Path) -> bool:
    """Crea la ruta vacía si no existe. Devuelve True si la creó."""
    p = ROOT / rel
    if p.exists():
        return False
    if not CHECK:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch()
    return True


def main() -> int:
    created = 0

    # ── corpus/ ─────────────────────────────────────────────────────────────
    man = ROOT / "corpus" / "manifest.json"
    if not man.exists():
        print("✗ falta corpus/manifest.json — sin él no sé qué rutas crear")
        return 1

    # audible, expanded y grain son campos del propio manifiesto, igual que
    # stems. NO se deducen: sólo una parte de los clips llega a expanded/ —
    # build_corpus.py exige ultrasonic_share >= 0.20— y derivar el nombre desde
    # audible/ producía 261 rutas donde el disco real sólo tiene 69.
    d = json.loads(man.read_text(encoding="utf-8"))
    rutas = set()
    for c in d.get("clips", []):
        for k in ("audible", "expanded", "grain"):
            if c.get(k):
                rutas.add(c[k])
        for v in (c.get("stems") or {}).values():
            if v:
                rutas.add(v)

    for r in sorted(rutas):
        created += touch(pathlib.Path("corpus") / r)

    # ── recordings/ ─────────────────────────────────────────────────────────
    for nombre, _, _ in RECORDINGS:
        created += touch(pathlib.Path("recordings") / nombre)

    # ── El aviso, para que nadie los confunda con audio roto ────────────────
    aviso = ROOT / "corpus" / "PLACEHOLDERS.md"
    texto = f"""# Archivos vacíos, a propósito

Los `.flac` de este directorio y los `.wav` de `recordings/` **están vacíos**.
No es una descarga corrupta: son marcadores de posición generados por
`tools/make_placeholders.py` para que las rutas que el motor espera existan y
puedan referenciarse, sin arrastrar {len(rutas)} archivos de audio al
repositorio.

## Qué falta y de dónde sale

| Ruta | Qué es | Cómo se obtiene |
|---|---|---|
| `corpus/audible/` | {sum(1 for r in rutas if r.startswith('audible/'))} clips a 48 kHz | `python3 tools/build_corpus.py` |
| `corpus/expanded/` | {sum(1 for r in rutas if r.startswith('expanded/'))} clips expandidos ×8 | idem |
| `corpus/grains/` | {sum(1 for r in rutas if r.startswith('grains/'))} granos de 2 s | idem |
| `corpus/stems/` | {sum(1 for r in rutas if r.startswith('stems/'))} stems por dominio | idem |
| `recordings/*.wav` | 2 sesiones del motor | se graban con `11_recording_system.scd` |

El original del corpus son grabaciones AudioMoth a 384 kHz de La Luna /
Planeta Rica; `corpus/manifest.json` —que sí está completo— lleva los metadatos
de los 261 clips y es lo que el motor lee para decidir qué suena cada día.

## Las dos sesiones grabadas

{chr(10).join(f'- `recordings/{n}` — {meta}  \\n  composiciones: {comp}' for n, meta, comp in RECORDINGS)}

De ahí salen las cinco composiciones de `web/`, cortadas donde el análisis de
RMS, centroide y flujo mostró comportamientos distintos del motor. Los cortes
exactos están en `web/build_media.sh`.

## Regenerar este árbol

```bash
python3 tools/make_placeholders.py          # crea lo que falte
python3 tools/make_placeholders.py --check  # sólo informa
```
"""
    if not CHECK and (not aviso.exists() or aviso.read_text(encoding="utf-8") != texto):
        aviso.write_text(texto, encoding="utf-8")
        print("  · corpus/PLACEHOLDERS.md actualizado")

    verbo = "faltan" if CHECK else "creados"
    print(f"{verbo} {created} placeholders  ({len(rutas)} rutas de corpus + "
          f"{len(RECORDINGS)} grabaciones)")
    return 1 if (CHECK and created) else 0


if __name__ == "__main__":
    sys.exit(main())
