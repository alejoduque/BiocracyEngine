# El tiempo del bosque como derecho de voz

**Fenología del bosque seco tropical, la escucha sensible de Mateo Hernández y el módulo p del BiocracyEngine**

*Objeto de Investigación Liminal — complemento de la monografía sobre BIOCRACIA*

**Reserva Manakai · El Balzal, Planeta Rica, Córdoba**
**08.47° N — 75.58° W · régimen bimodal**

---

## 1. La fenología como hecho político, no como dato

El bosque seco tropical no tiene un tiempo: es un tiempo. En Córdoba, ese tiempo es bimodal y el código del proyecto ya lo inscribe como una constitución temporal de cuatro estaciones: la Seca (días 335–90), las Primeras lluvias (91–151), el Medio seco (152–243) y las Segundas lluvias (244–334). La mayoría de los árboles pierden el follaje en la sequía y reverdecen con la primera lluvia; la composición acústica del paisaje se reordena por completo entre estaciones; las relaciones entre especies se reescriben según la disponibilidad de agua. Cualquier sistema de gobernanza del bosque seco que opere a la escala mensual de los informes financieros o a la escala bianual de la cooperación internacional comete, antes que un error técnico, un error de jurisdicción temporal: legisla sobre un cuerpo cuyo reloj no escucha.

La tesis sostiene una proposición fuerte: el bosque seco es un sistema de phraseología en el sentido lyotardiano. Una ausencia de vocalizaciones del aullador (*Alouatta seniculus*) durante treinta días no es una observación científica neutra: es una frase con efectos posicionales, una enunciación del territorio que, inscrita en la base del dIAP, activa los protocolos comunitarios de revisión. Lo decisivo es que el peso de esa frase depende de la estación: una ausencia en plena sequía significa algo distinto a la misma ausencia en lluvias. La fenología, así, no es el marco de fondo de la política del bosque: es su gramática.

El módulo p del BiocracyEngine es el dispositivo donde esa gramática se vuelve audible y visible —y, en el horizonte de este texto, votante.

---

## 2. La forma sensible de investigación de Mateo Hernández

Mateo Hernández Schmidt es biólogo de campo —entomología, ornitología, botánica— con cientos de registros aportados a iNaturalist / Naturalista Colombia, concentrados en reservas del bosque seco y húmedo del Caribe y el Magdalena Medio (Sanguaré, en San Onofre, Sucre; Cañón del Río Claro, en Antioquia). Su escritura, en el blog *Biodiversidad y Conservación*, no es la del paper ni la del informe: articula observación directa, revisión bibliográfica y narración naturalista. Esa tercera capa es lo que aquí interesa nombrar como forma sensible de investigación.

Tres rasgos de su método tienen consecuencias directas para la fenología de Manakai y para el módulo p:

**Primero, la estructuración por tiempo doble.** Su inventario de los insectos de Sanguaré no se organiza por taxonomía sino por hábitat de cría, por temporada del año y por horario diario —literalmente, "24 horas". Hernández no clasifica primero y temporaliza después: temporaliza desde el comienzo. La biodiversidad, en su escritura, ya viene fechada y horaria. Esta es exactamente la operación que el slot P automatiza: cada especie no es una entrada de catálogo sino una ventana de actividad en el año y en el día.

**Segundo, la lectura del movimiento como estado del mundo.** En su serie *Movimientos recientes de las aves*, Hernández documenta la expansión de la maría mulata (*Quiscalus mexicanus*) y de la mirla parda (*Turdus grayi*) desde el Caribe hacia el interior y la altura andina —la mirla, que él mismo registró a 2000 m en Jardín en 2021, cuando hasta fines del siglo XX no pasaba de los 300 m. Y lo formula como tesis epistémica: los cambios en la avifauna son una lectura del estado del mundo. Esto es, en clave biológica, lo mismo que la tesis afirma en clave filosófica: la presencia, la ausencia y el desplazamiento de las especies enuncian. No ilustran un argumento sobre el clima: lo argumentan.

**Tercero, la relación como unidad de observación.** Sus posts sobre plantas hospederas de orugas no describen lepidópteros ni plantas por separado, sino el acople entre ellos —qué planta sostiene a qué larva. La unidad mínima de su mirada no es el organismo sino el vínculo fenológico: la sincronía entre la hoja nueva y la oruga que la espera. Es la misma figura que organiza la octofonía del Parlamento de lo Vivo, donde ningún canal significa solo: la lluvia que regresa, la rana que responde, el ave que se calla componen una sesión.

Lo que la práctica de Hernández aporta a Manakai no es un dato sobre Manakai —Sanguaré no es la Finca Manakai, y el rigor exige no fundir los sitios. Lo que aporta es un protocolo de atención: una manera de mirar el bosque seco caribeño en la que el tiempo (estacional y circadiano) y la relación (hospedante–huésped, presencia–ausencia, residente–migratorio) son anteriores a la especie. Ese protocolo es la condición sensible de posibilidad del módulo p. Antes de que el código pueda calcular qué especies están "activas" un día cualquiera, alguien tuvo que aprender a ver el bosque como un calendario de vínculos. Hernández escribe esa mirada; el slot P la ejecuta.

---

## 3. El módulo p: el bosque toca el sinte

El slot P —el Calendario Fenológico— es uno de los once módulos visuales del BiocracyEngine, y deliberadamente el más áspero. Mientras el resto del instrumento usa una paleta cálida/fría de inspiración steineriana, el slot P se renderiza en 1-bit puro: fondo negro, geometría de alambre blanca, tipografía monoespaciada Courier New, antialiasing desactivado, transiciones cuantizadas con `steps()`, etiquetas de mes con sombra de píxel. Parece un terminal vectorial —una cita explícita del linaje CRT/Vectrex— de modo que el módulo ecológicamente más fundamentado es el computacionalmente más crudo. Esta es una decisión estética con carga argumental: la verdad del bosque no necesita el suavizado; entra al instrumento en su forma vectorial mínima, sin disimulo.

Su mecánica es precisa. El calendario carga el inventario de especies de Manakai (`manakai_species.json`) y, de manera determinista a partir del nombre científico y el taxón, asigna a cada una un día pico y una ventana de actividad. El modelo fenológico está calibrado sobre la realidad bimodal de Córdoba:

- hierbas y trepadoras: dos picos, ~abril–mayo (día 115) y ~septiembre–octubre (día 270);
- árboles: escalonados, con sesgo a marzo (75) y agosto (220);
- anfibios: pico agudo con las primeras lluvias (abril, ~110);
- reptiles: cálido-seco (febrero–marzo, ~60);
- mamíferos: ventana ancha (~julio, 190);
- aves residentes: reproducción al inicio de lluvias (mayo, ~135);
- aves migratorias: visitantes de invierno boreal (octubre–marzo, ~315).

Cada día del año, para cada especie, el módulo calcula la distancia cíclica entre el día actual y su día pico y la convierte en una actividad gaussiana (pico = 1). Cuando esa actividad supera 0.5, la especie cuenta como activa ese día. El brillo y el tamaño de cada nodo en el anillo de 365 días son función directa de su actividad: las especies fuera de temporada se apagan, las que están en su momento se encienden. La fracción de especies activas —junto con el día del año— se reinyecta como `harmonicrich` y `texturedepth` en el motor de SuperCollider, y modula el brillo de consenso propagado por `/bio/consensus` a todos los módulos. En la formulación del propio proyecto: el bosque toca el sinte.

Aquí se cierra el círculo con Hernández. Lo que él hace con la prosa —fechar y horar la biodiversidad, leer la presencia como enunciación— el slot P lo hace con la geometría y el sonido. La fracción de especies activas no es una estadística: es el quórum sensible del territorio en un día dado. Y como en la octofonía del Parlamento, ese quórum no es simétrico: un día de primeras lluvias, con anfibios en pico agudo y aves residentes reproduciéndose, suena —y vota— distinto a un día de medio seco. El módulo p es, en este sentido, el único módulo del instrumento cuya fuente no es ni la blockchain ni el gesto del intérprete, sino el calendario propio del bosque. Es el escaño del tiempo.

Por eso es un Objeto de Investigación Liminal en sentido pleno y no una mera visualización: no representa la fenología, la enactúa como una de las voces del instrumento. La pregunta que abre —¿qué le ocurre al consenso cuando uno de sus moduladores es el año tropical y no un humano?— no se responde con texto. Se responde tocándolo.

---

## 4. El Parlamento de lo Vivo: del escaño acústico al escaño estatutario

La instalación *Parlamento de lo Vivo* (Festival de la Imagen, 2025) ya realizó, en registro artístico, una sesión de un parlamento más-que-humano: ocho canales, ocho escaños, ocho voces del territorio. El arte precedió a la institución y la exigió. Lo que sigue es el intento de llevar esa exigencia al único lugar donde adquiere fuerza vinculante: el articulado estatutario de la Corporación Manakai.

Los Estatutos V2 ya contienen la semilla. Su Artículo 5 fija como objeto social "el bienestar de todas las formas de vida"; el Artículo 21 enuncia, entre los principios de gobernanza, "la protección del bienestar de todas las formas de vida". Pero los órganos de gobierno —Asamblea General, Junta Directiva, Dirección Ejecutiva, Consejo Científico, Técnico y Comunitario— y los "miembros con derecho a voto" (Fundadores y Activos) son, sin excepción, humanos. El bienestar de lo vivo es el fin; lo vivo no es todavía sujeto. La biocracia propone cerrar esa distancia: que aquello en cuyo nombre se gobierna obtenga presencia en cómo se gobierna.

La propuesta no reemplaza la asamblea humana —la acompaña con una instancia nueva, gobernada por el tiempo fenológico y traducida por el módulo p. La llamo, en coherencia con la obra, **Cámara Fenológica de lo Vivo**. Lo que sigue es su articulado, redactado para integrarse a los Estatutos respetando su técnica (capítulos, artículos, parágrafos) y sus salvaguardas.

---

## 5. Propuesta de articulado

### CAPÍTULO VI — DE LA CÁMARA FENOLÓGICA DE LO VIVO

**ARTÍCULO 41. Naturaleza y fundamento.** Créase la Cámara Fenológica de lo Vivo como instancia de participación, deliberación y consenso de las formas de vida no humanas del territorio de la Reserva Manakai, en desarrollo del objeto social (Artículo 5) y del principio de protección del bienestar de todas las formas de vida (Artículo 21). La Cámara no sustituye a la Asamblea General; constituye una instancia de voz vinculante por consulta y de voto modulado, conforme a los presentes artículos.

*Parágrafo.* La Cámara reconoce que las formas de vida del territorio enuncian mediante su presencia, su ausencia, su vocalización, su floración, su fructificación y su silencio. Estas enunciaciones constituyen actos de participación y serán inscritas, traducidas y deliberadas conforme a este Capítulo.

**ARTÍCULO 42. Calendario de la Cámara.** La Cámara no se regirá por el calendario gregoriano sino por el calendario fenológico bimodal del bosque seco tropical de Córdoba, dividido en cuatro temporadas: Seca, Primeras lluvias, Medio seco y Segundas lluvias. Toda sesión, plazo, quórum y consenso de la Cámara se computará en días fenológicos del año (1–365) y no en meses calendario.

*Parágrafo.* La Cámara sesionará de manera continua a lo largo del año fenológico, con cuatro sesiones de apertura de temporada que coinciden con los umbrales estacionales. La Asamblea General Ordinaria humana (Artículo 24) recibirá, dentro de sus tres primeros meses, el acta fenológica del año que la Cámara haya producido.

**ARTÍCULO 43. Miembros de la Cámara.** Son miembros de la Cámara Fenológica de lo Vivo el conjunto de especies y comunidades de vida inventariadas en el territorio —flora, anfibios, reptiles, mamíferos y aves— y las relaciones ecológicas entre ellas (hospedante–huésped, polinización, dispersión, depredación, residencia y migración).

*Parágrafo Primero.* Los miembros se agrupan, para efectos de participación, en bancadas fenológicas según su régimen de actividad: bancadas de las Primeras lluvias (anfibios, aves residentes en reproducción), del Medio seco (mamíferos), de la Seca cálida (reptiles, aves migratorias boreales) y de las dos floraciones (flora herbácea y trepadora, flora arbórea).

*Parágrafo Segundo.* Las especies migratorias tendrán voz y voto estacionales: su escaño se activa únicamente durante su ventana de presencia en el territorio y se suspende en su ausencia, sin pérdida de la calidad de miembro.

**ARTÍCULO 44. La voz: presencia como enunciación.** La voz de cada miembro se ejerce a través de su presencia fenológica y acústica registrada por la infraestructura del Parlamento (sensores AudioMoth, cámaras trampa, registros de campo, inventarios florales) y traducida por el módulo p del BiocracyEngine, que computa para cada especie y cada día su grado de actividad.

*Parágrafo.* Ninguna enunciación del territorio requiere ser hecha por un sujeto consciente para tener efecto. La ausencia es también voz: la no-vocalización sostenida de una especie focal por encima de su umbral fenológico constituye una frase con efectos deliberativos.

**ARTÍCULO 45. El voto: el quórum sensible.** El voto de la Cámara se computa como la fracción de especies activas en el día fenológico de la decisión, conforme al modelo del módulo p: se considera activa toda especie cuya actividad gaussiana respecto de su día pico supere el umbral de 0.5. Esta fracción constituye el quórum sensible del territorio.

*Parágrafo Primero.* Las decisiones que afecten directamente el bienestar de las formas de vida —ordenamiento del territorio, intervención de coberturas, infraestructura, manejo de agua— requerirán que el quórum sensible de la temporada respectiva sea favorable, computado sobre las bancadas en pico durante esa temporada.

*Parágrafo Segundo.* El voto de la Cámara modula —no anula— las decisiones de la Asamblea General humana, a través del valor de consenso propagado por la señal `/bio/consensus`. Una decisión humana adoptada contra un quórum sensible negativo deberá ser motivada, registrada en el acta fenológica y revisada en la sesión de apertura de la siguiente temporada.

**ARTÍCULO 46. Protocolo de alerta fenológica.** La ausencia sostenida de vocalizaciones o presencia de una especie focal, ponderada por la estación en que ocurre (una ausencia en Seca y una en lluvias tienen distinto significado), activará automáticamente un protocolo de revisión del estado del territorio que la Junta Directiva y el Consejo Científico, Técnico y Comunitario deberán atender en la sesión inmediatamente siguiente.

**ARTÍCULO 47. La traducción y la opacidad.** La comunidad de El Balzal, los investigadores y el Consejo Científico, Técnico y Comunitario actúan como traductores de las enunciaciones del territorio, no como sus representantes ni sustitutos. Su función es inscribir, dar forma deliberativa y comunicar las frases del bosque, sin pretender hablar por él.

*Parágrafo (cláusula de opacidad).* El derecho a la opacidad de las formas de vida es una salvaguarda constitucional de la Cámara. No toda enunciación del territorio debe ser hecha transparente, capturada o tokenizada. La Cámara reconoce que el bosque excede todo sistema de captura y que esa excedencia es un rasgo protegido, no una falla a corregir. Ninguna decisión podrá fundarse en la pretensión de haber traducido por completo la voz de lo vivo.

**ARTÍCULO 48. Salvaguarda contra la captura.** Los registros, datos y BioTokens derivados de la actividad de la Cámara permanecerán bajo soberanía comunitaria y no podrán destinarse a la apropiación privada, la especulación financiera ni la subordinación del territorio a intereses incompatibles con el objeto social (en concordancia con el Artículo 38). La participación de lo vivo no podrá invocarse para legitimar decisiones extractivas.

*Parágrafo.* Las disposiciones de este Capítulo relativas al quórum sensible, la cláusula de opacidad y la salvaguarda contra la captura estarán sujetas a las reglas de mayoría calificada reforzada (80%) previstas en el Artículo 27, por afectar principios fundacionales de la Corporación.

---

## 6. Coda: la confluencia

Lo que confluye en la Cámara Fenológica no es una metáfora hecha norma, sino tres prácticas que ya operaban por separado encontrándose en un mismo dispositivo. La fenología del bosque seco aporta el reloj —un tiempo bimodal, propio, no subordinado al del Estado ni al del mercado—. La escucha sensible de Mateo Hernández aporta el protocolo de atención: la disciplina de ver el bosque como un calendario de vínculos donde la presencia, la ausencia y el movimiento ya son enunciaciones. El módulo p del BiocracyEngine aporta la máquina de traducción: el lugar donde ese reloj y esa mirada se vuelven cómputo, geometría de 1-bit y modulación de consenso —donde el bosque, literalmente, toca el sinte.

El articulado no inventa la voz del territorio: la formaliza. La Reserva Manakai tiene presencia digital desde 2016, antes de que existiera esta tesis; el bosque ya buscaba idiomas para hacerse presente donde se decide su destino. La Cámara Fenológica de lo Vivo es uno de esos idiomas, llevado por fin al registro vinculante de un estatuto. Que el quórum de una decisión dependa de cuántas especies están en su pico ese día no es una poética: es la consecuencia institucional de tomarse en serio que el bosque enuncia. El Parlamento de lo Vivo deja de ser una instalación que convoca una sesión imaginaria y se convierte en lo que el arte exigía que fuera: un órgano de gobierno cuyo presidente, durante las primeras lluvias, es el coro de las ranas.
