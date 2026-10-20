// Faderfox LC2 · lo aprendido en la GUI de SC (clic en la luz MIDI → APRENDE).
// Va encima del mapa de fábrica de 2_midi_control.scd.
// asignar: [tipo, rol, CC o nota, destino] · tipo abs, rel o nota
//          rol 0 = canal 10/13 · 1 = canal 11/14 · 2 = canal 12/15
// soltar: destinos que perdieron sus controles de fábrica
(
    soltar: [],
    asignar: [
        ['nota', 0, 2, ['accion', 'dia']],
        ['nota', 0, 10, ['mute', 'mixGolpe']]
    ]
)
