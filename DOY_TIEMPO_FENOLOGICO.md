# El DOY: el día del año como estructura temporal

### Notas para el capítulo *De la bioacústica a la biocracia*

---

## 1. Qué es el DOY

**DOY** es la sigla inglesa de *day of year* — día del año, o **fecha ordinal**.
Es un entero entre 1 y 365 (366 en año bisiesto) que nombra la posición de un
día dentro del ciclo anual sin decir a qué mes pertenece: el 1 de enero es 1, el
31 de diciembre es 365.

La sigla es de uso corriente en fenología, ecología de campo, teledetección y
ecoacústica. Su ventaja no es la brevedad sino **lo que decide no representar**.
Una fecha civil —"9 de enero de 2024"— nombra tres cosas a la vez: una posición
en el ciclo estacional, una posición en una serie histórica lineal, y una
convención administrativa (el mes, que no corresponde a ningún fenómeno
natural). El DOY conserva únicamente la primera. Dice *dónde en el ciclo*
ocurrió algo, y calla deliberadamente en qué año y bajo qué calendario.

Esa sustracción es exactamente lo que lo vuelve útil para pensar el tiempo de un
bosque, y es la razón por la que este capítulo lo trata como concepto y no como
detalle de implementación.

### 1.1 Precisiones necesarias

Conviene distinguir el DOY de tres nociones con las que se confunde:

- **No es la fecha juliana** (*Julian Day Number*), que es un conteo continuo de
  días desde el 1 de enero del 4713 a.C. y sirve a la astronomía para calcular
  intervalos largos. El DOY se reinicia cada año; la fecha juliana no se
  reinicia nunca. La confusión es frecuente porque en muchos programas de
  teledetección al DOY se le llama, incorrectamente, "julian date".
- **No es ISO 8601 ordinal** en sentido estricto, aunque coincide con él:
  ISO 8601 admite la forma `AAAA-DDD` (por ejemplo `2024-009`), que es
  precisamente año más DOY. El DOY usado aisladamente es esa segunda mitad,
  huérfana del año a propósito.
- **No es una semana ni un mes.** Semanas y meses son particiones
  administrativas; el DOY no particiona, sólo ordena.

### 1.2 El problema del año bisiesto

Un año bisiesto tiene 366 días, de modo que a partir del 29 de febrero el DOY se
desplaza un día respecto de los años comunes: el 1 de marzo es DOY 60 en un año
común y 61 en uno bisiesto. Para series de varios años esto introduce un error
sistemático de un día en la segunda mitad del año.

Las soluciones habituales son tres: ignorarlo (aceptable cuando la resolución
del fenómeno es de semanas, no de días); trabajar en DOY fraccionario
normalizado (`doy / díasDelAño`), que preserva la fase a costa de la unidad
"día"; o plegar el 29 de febrero sobre el 28. Ninguna es neutral, y la elección
debe declararse. Volveré sobre esto en §5.3, porque el motor descrito aquí toma
la tercera y esa decisión tiene consecuencias.

---

## 2. Por qué la fenología no usa fechas

La fenología estudia el calendario de los seres vivos: cuándo florece un árbol,
cuándo migra un ave, cuándo empieza a cantar una rana. Su objeto no son los
eventos sino **su fase dentro del ciclo**, y por eso la fecha civil es una
unidad inadecuada.

Si se quiere saber si la floración de una especie se está adelantando por
calentamiento, la pregunta relevante es "¿en qué DOY floreció este año frente al
DOY medio de la serie?". Formulada con fechas, la comparación exige traducir
constantemente entre meses de longitud desigual. Formulada en DOY, es una resta.

De ahí que el DOY sea la unidad de las series fenológicas y de los productos
satelitales que estiman inicio de estación de crecimiento, fin de estación y
duración: son todos, literalmente, números de día del año.

Hay además una razón conceptual, no sólo aritmética. La fecha civil pertenece a
la administración: fija vencimientos, jornadas, ejercicios fiscales. El DOY
pertenece al ciclo. Adoptarlo es un gesto pequeño pero real de **descentramiento
del calendario estatal** en favor del calendario del fenómeno — y es ahí donde
este capítulo lo conecta con la biocracia.

---

## 3. El DOY en bioacústica

En bioacústica y ecoacústica el DOY organiza el material en tres registros
distintos:

**Como eje de agregación.** Una grabadora autónoma que registra durante meses
produce miles de archivos. Agruparlos por DOY convierte una pila de archivos en
una curva anual: índices acústicos, riqueza de eventos o actividad por especie
se vuelven funciones del día del año.

**Como coordenada de la fase.** Los coros de anfibios, los cantos territoriales
de aves y la estridulación de insectos no ocurren "en marzo": ocurren en una
fase del ciclo de lluvias que en un año cae en marzo y en otro en abril. El DOY,
combinado con la hora, sitúa una grabación en las dos periodicidades que de
verdad gobiernan la señal: la anual y la diaria.

**Como criterio de vecindad.** Dos grabaciones separadas por tres días son
razonablemente comparables; separadas por cinco meses, no. El DOY da una métrica
de distancia sobre el año —con la particularidad de que es **circular**: la
distancia entre el DOY 360 y el DOY 5 es de diez días, no de 355. Esa
circularidad es lo que obliga a tratar el año como un anillo y no como una
recta, y tiene consecuencias formales que se detallan enseguida.

---

## 4. El DOY como estructura en el motor

En el sistema que acompaña esta investigación, el DOY no es un metadato: es la
estructura sobre la que se organiza toda la capa fenológica. Lo que sigue
describe la implementación real, con sus cifras.

### 4.1 El anillo

Cada grabación del corpus lleva un `doy` asignado en la ingesta a partir de su
marca temporal (`tools/build_corpus.py`). Los clips se distribuyen en un anillo
de 365 posiciones, `~phenoRing`, donde cada posición guarda las grabaciones
hechas ese día del año.

El cursor que recorre el anillo, `~phenoCursor`, es un número **de coma
flotante**: se mueve de forma continua y el día es su parte entera. El tiempo
del instrumento no salta de día en día, lo atraviesa.

La aritmética del anillo es explícitamente circular:

```
wrapped = ((d - 1) % 365) + 1
```

De modo que el año no tiene principio ni fin. Al pasar del 365 se llega al 1 sin
discontinuidad, y una ventana centrada en el DOY 2 alcanza sin problema al 363.
Es una decisión formal con carga conceptual: **el año no es un segmento con
extremos, es un ciclo cerrado**, y el código no tiene ningún lugar donde el año
"empiece".

### 4.2 Las cuatro temporadas

El DOY determina la temporada, y las temporadas son las del bosque seco tropical
colombiano, no las cuatro estaciones templadas:

| Temporada | Rango DOY | Días |
|---|---|---|
| Seca | 335–90 *(cruza el fin del anillo)* | 121 |
| Primeras lluvias | 91–151 | 61 |
| Medio seco | 152–243 | 92 |
| Segundas lluvias | 244–334 | 91 |

Vale la pena detenerse en la primera fila. La temporada seca **envuelve el
extremo del anillo**: empieza en diciembre y termina en marzo. En un modelo
lineal del año habría que representarla como dos temporadas distintas, una al
final y otra al principio, lo cual es falso — es una sola. Sólo el anillo
permite decir la verdad sobre ella. La estructura de datos no ilustra el
argumento: lo hace posible.

También conviene notar que el corpus original traía una etiqueta binaria
—"época lluvias / seca"— y que fue reemplazada por estas cuatro derivadas del
DOY. La razón es que la binaria describe la precipitación, no el ciclo acústico:
el medio seco tiene una voz distinta de la seca aunque ambas sean "no lluvia".

### 4.3 La ventana gaussiana: oír un día desde otro

Un día sin grabación no queda mudo por decreto. Al pedir el material de un DOY,
el sistema recoge también el de los días vecinos, con un peso que decae como una
gaussiana:

```
sigma   = anchoVentana * 3
alcance = anchoVentana * 6
caída   = exp(−distancia² / (2·sigma²))
```

y la presencia final de un clip combina esa caída con la confianza del detector
y la actividad del día:

```
presencia = caída · (0.45 + 0.35·confianza + 0.20·actividad)
```

El punto decisivo —y es un punto epistemológico, no técnico— es que **la ventana
nunca inventa audio**. No interpola, no sintetiza, no genera un día plausible.
Sólo permite que una grabación *real* se oiga desde más lejos en el anillo. Con
la ventana estrecha los días son puntos aislados en el silencio; con la ventana
ancha se derraman unos sobre otros. Lo que no ocurre en ningún ajuste es que
aparezca material que nadie grabó.

Esta distinción entre **extender el alcance de un dato** e **inventar el dato
faltante** es, a mi juicio, la frontera entre una representación honesta y una
ficción de completitud. La mayoría de las visualizaciones ambientales cruzan esa
frontera sin declararlo, y lo hacen precisamente por medio de la interpolación.

### 4.4 La ausencia como material

De aquí se sigue la decisión más importante de todo el diseño. Los números
reales del corpus:

| Temporada | Días en el anillo | Días grabados | Cobertura | Clips |
|---|---:|---:|---:|---:|
| Seca | 121 | 18 | 14.9 % | 134 |
| Primeras lluvias | 61 | **0** | **0 %** | 0 |
| Medio seco | 92 | 16 | 17.4 % | 127 |
| Segundas lluvias | 91 | **0** | **0 %** | 0 |
| **Total** | **365** | **34** | **9.3 %** | **261** |

- Primer día grabado: **DOY 9**. Último: **DOY 234**.
- Días del año sin ningún registro: **331**.
- Mayor hueco continuo entre días grabados: **179 días**.

El corpus **no es un año**. Es el 9.3 % de un año, concentrado en dos de las
cuatro temporadas, con las dos temporadas de lluvias íntegramente ausentes y un
vacío central de casi seis meses.

Un sistema convencional trataría esto como un defecto a disimular: interpolaría,
promediaría, repetiría material hasta que la rueda pareciera completa. Este no.
La ausencia se declara y se sostiene: un día no grabado suena como lo que es —un
día del que no hay testimonio— y el instrumento se abre además en un día
realmente grabado (el 9) en lugar del DOY 1, porque arrancar en el 1 significaba
ocho minutos de nada y se leía como una avería.

Hay aquí una diferencia que quiero subrayar para el argumento del capítulo: **la
ausencia se atraviesa, no se rellena, pero tampoco se convierte en el motivo de
apertura**. Es material, no gesto.

Y hay un segundo punto, más incómodo y más interesante: esos huecos no son
neutrales. Que falten *justamente* las dos temporadas de lluvias no es azar
—desplegar y mantener grabadoras en lluvia es más difícil, y el equipo falla
más— sino un **sesgo sistemático del método de captura**. Un sistema que
interpolara ese vacío no sólo inventaría audio: reproduciría el sesgo
presentándolo como cobertura. La política de no interpolar es, entonces, lo que
mantiene visible una limitación del trabajo de campo en lugar de esconderla bajo
una superficie continua.

---

### 4.5 El día del año como acústica: el quórum y la sala

Hay una consecuencia del DOY que no es metafórica y que conviene desarrollar
aquí porque cierra el argumento de §4.4.

Para cada posición del anillo el sistema calcula un **quórum**: la fracción de
los seres elegibles ese día cuya presencia supera el umbral (Art. 45). Es una
medida de asistencia, y está indexada por DOY —es decir, *el día del año
determina cuántos están presentes*.

Ese número gobierna ahora la acústica de la sala común por la que se escucha
todo el motor. La regla no es una analogía sino la ecuación de Sabine:

> RT60 = 0.161 · V / A

El tiempo de reverberación cae al aumentar la absorción total, y un ocupante
*es* absorción. Una sala vacía retumba; una llena es sorda. Cualquiera lo ha
oído al entrar a un auditorio antes y después de que llegue el público.

| Quórum | RT60 | Amortiguación | Proporción por la sala común |
| :---: | :---: | :---: | :---: |
| 0.00 | 6.6 s | 2130 Hz | 45 % |
| 0.50 | 4.8 s | 1651 Hz | 73 % |
| 1.00 | 3.0 s | 1172 Hz | 100 % |

Lo interesante es que la expectativa ingenua se invierte. Uno esperaría que más
voces produjeran un sonido mayor; acústicamente ocurre lo contrario. **Una
asamblea no agranda el recinto: lo absorbe.** La presencia es lo que vuelve
íntimo el espacio, y la ausencia es lo que lo vuelve inmenso.

De ahí se sigue lo que importa para este capítulo. Los 331 días sin registro de
§4.4 no son un silencio ni un hueco tapado: son **una sala con nadie dentro**,
y una sala vacía es precisamente la que más resuena. El corpus cubre el 9.3 %
del año, de modo que durante más del noventa por ciento del tiempo el
instrumento suena como un recinto desocupado —cola larga, agudos abiertos, cada
voz sola en un espacio grande—. La cobertura no se disimula: se oye.

Esto convierte el Artículo 44 en algo audible en lugar de declarado. La ausencia
deja de ser una decisión de no interpolar —una negativa, algo que el sistema no
hace— y pasa a tener forma positiva: **un escaño vacío que resuena**. No se
rellena el día que falta; se oye la sala que ese día deja vacía.

Y da una lectura acústica a la distinción entre estar reunidos y no estarlo. Con
el quórum bajo, cada voz conserva su reverberación propia y suena en su acústica
particular; al subir, una proporción mayor pasa por la sala común. Una asamblea
plena queda *constituida* por compartir un mismo espacio; una vacía son unos
pocos que suenan cada uno en el suyo. La disidencia, en este instrumento, tiene
acústica privada.

---

## 5. Consecuencias para el argumento del capítulo

### 5.1 Del tiempo lineal al tiempo cíclico

Adoptar el DOY como eje no es una comodidad de programación, es una toma de
posición sobre el tiempo. La fecha civil pertenece a una temporalidad lineal,
acumulativa e histórica —la del expediente, la del registro, la del progreso—.
El DOY pertenece a una temporalidad cíclica, de retorno y de fase.

Un sistema que organiza su archivo por fecha construye una serie: cada evento es
posterior a otro y el conjunto avanza. Un sistema que lo organiza por DOY
construye un anillo: cada evento tiene vecinos a ambos lados, el año se cierra
sobre sí mismo y "avanzar" deja de ser la operación fundamental. La segunda es,
sencillamente, más cercana a cómo un bosque estacional se comporta.

Vale la pena decir con precisión qué se pierde: al proyectar todo sobre un
anillo de 365 posiciones **se descarta el año**. Dos grabaciones del DOY 100 en
años distintos caen en la misma posición y se vuelven indistinguibles para el
motor. Eso hace al sistema estructuralmente incapaz de mostrar una tendencia
interanual —no puede decir que algo se adelantó respecto de hace una década—.
Es una renuncia real, y es el precio de la elección: se gana la fase, se pierde
la historia. Un trabajo sobre cambio climático necesitaría exactamente lo
contrario.

### 5.2 El calendario como institución

Si la biocracia designa un orden en el que entidades no humanas tienen posición
política, entonces **el calendario es una de las instituciones que hay que
descolonizar**. Los meses gregorianos no describen ningún proceso del bosque
seco tropical; son un artefacto administrativo de origen imperial que se aplica
por igual a un banco y a una selva.

Sustituirlos por las cuatro temporadas derivadas del DOY es un gesto modesto
pero coherente: el sistema deja de medir el año con la unidad del Estado y pasa
a medirlo con la unidad del ecosistema. Y como la temporada seca cruza el fin
del anillo, el nuevo calendario resulta **incompatible con la representación
lineal** — no es el calendario viejo con otros nombres, es otra forma.

### 5.3 Los límites que el propio DOY impone

La honestidad metodológica exige registrar también lo que el DOY no puede hacer,
y no presentarlo como una unidad inocente:

1. **Aplana el año.** Ya señalado en §5.1: dos años distintos colapsan en la
   misma posición. Sin tendencia interanual.
2. **Pliega el año bisiesto.** La aritmética del anillo trabaja módulo 365, de
   modo que el 29 de febrero se pliega sobre su vecino. Es aceptable para este
   material —la ventana gaussiana es mucho más ancha que un día— pero es una
   pérdida y debe declararse, no descubrirse.
3. **Presupone la estacionalidad.** El DOY es informativo en la medida en que el
   año *tenga* fase. En un bosque húmedo ecuatorial sin estacionalidad marcada,
   ordenar por día del año explicaría mucho menos.
4. **No es el fenómeno.** El DOY es la coordenada, no lo coordinado. Que dos
   grabaciones compartan DOY no las hace equivalentes: la hora, el hábitat, el
   año y el estado del equipo siguen siendo determinantes. El anillo es un
   soporte para la escucha, no una explicación de ella.
5. **Su vecindad es una hipótesis.** La ventana gaussiana asume que la
   proximidad en el anillo implica semejanza acústica. Es razonable, y es
   revisable: en el filo de una transición de temporada, dos días contiguos
   pueden diferir más que dos separados por un mes dentro de la misma
   temporada. El parámetro de ancho existe precisamente para que esa hipótesis
   sea ajustable y discutible, no fija.

---

## 6. Síntesis

El DOY es una unidad pequeña con una consecuencia grande. Al conservar la fase y
descartar el año, convierte el archivo en anillo; al convertirlo en anillo, hace
posible una temporada que envuelve el extremo, una vecindad circular y una forma
de recorrer el tiempo que no es acumulativa. Y al ser tan explícito sobre qué
día es cada cosa, vuelve **imposible ocultar los días que faltan**: en este
corpus, 331 de 365.

Esa última propiedad es la que más importa para el tránsito de la bioacústica a
la biocracia. Un archivo organizado por DOY no puede fingir que cubre el año. La
unidad misma delata su propia insuficiencia — y un sistema que se propone dar
voz política a lo no humano haría mal en empezar simulando que ya lo escuchó
todo.

Y como el quórum de cada día gobierna la absorción de la sala común (§4.5), esa
insuficiencia no queda sólo consignada en una tabla: se escucha. Durante el
90.7 % del año el instrumento suena como un recinto desocupado. El corpus dice
cuánto falta y la acústica lo confirma en el mismo gesto.

---

## Apéndice: referencias en el código

| Elemento | Ubicación |
|---|---|
| Asignación del DOY en la ingesta (`tm_yday`) | `tools/build_corpus.py` |
| Tabla de temporadas (Art. 42) | `tools/build_corpus.py`, `TEMPORADAS` |
| Anillo de 365 posiciones | `14_phenological_corpus.scd`, `~phenoRing` |
| Cursor continuo | `14_phenological_corpus.scd`, `~phenoCursor` |
| Ventana gaussiana (Art. 43) | `14_phenological_corpus.scd`, `~phenoPool` |
| Temporada desde el DOY | `14_phenological_corpus.scd`, `~phenoSeason` |
| Día no grabado (Art. 44) | `14_phenological_corpus.scd` |
| Presencia (Art. 45) | `14_phenological_corpus.scd`, `~phenoPool` |
| Envío del DOY a la capa visual | `/camara/doy` |
| Quórum del día (Art. 45) | `14_phenological_corpus.scd`, `~phenoQuorum` |
| Sala común y absorción por quórum | `3_synthdefs.scd`, `\resonantChamber` |

---

## Nota sobre la bibliografía

Este documento no incluye referencias bibliográficas verificadas. Los marcos que
convoca —la opacidad de Édouard Glissant, la ecología profunda de Arne Næss, la
ecología del paisaje sonoro— aparecen aquí como orientación conceptual y deben
ser citados por el autor con las ediciones y páginas correspondientes. Las
afirmaciones empíricas sobre el corpus, en cambio, están tomadas directamente
del manifiesto de datos y del código, y son reproducibles: 261 clips, 34 días
distintos, DOY 9 a 234, 331 días sin registro.
