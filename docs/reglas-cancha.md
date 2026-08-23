# Reglas de la cancha y del entorno

## Propósito

Este documento registra las reglas espaciales y visuales de la cancha interactiva. Es la referencia para futuras modificaciones de ubicación, líneas, zonas, numeración y elementos del entorno.

El cuadro visual **Instrucciones** es únicamente informativo y no debe actualizarse automáticamente cada vez que cambie una regla. Las reglas vigentes se consultan en este archivo.

## Sistema de coordenadas

- El tablero completo tiene `12 columnas x 9 filas`.
- El área de juego verde ocupa `10 columnas x 7 filas`.
- La primera casilla verde es `A1`.
- La última casilla verde es `J7`.
- La columna `K` no pertenece al área verde.
- Las coordenadas aumentan de izquierda a derecha y de arriba hacia abajo.
- La geometría se calcula en el `viewBox` SVG `1672 x 941`.
- El eje vertical central está ubicado entre las columnas `E` y `F` del área verde.

## Marco o franja exterior

El marco exterior está formado por las casillas que cumplen una de estas condiciones:

- Primera fila del tablero.
- Última fila del tablero.
- Primera columna del tablero.
- Última columna del tablero.

El marco contiene `38 casillas` y se identifica con numeración omega continua: `Ω1` a `Ω38`.

Las casillas del marco tienen color naranja oscuro. El relleno y el perímetro del marco son independientes de las casillas verdes.

## Área verde

Las `70 casillas` interiores conservan numeración alfanumérica propia:

- Columnas: `A` a `J`.
- Filas: `1` a `7`.
- Rango: `A1` a `J7`.

La numeración verde no continúa la numeración omega y no incluye las casillas del marco.

## Líneas y grosores

- Las líneas internas normales son blancas de `1 px`.
- La línea vertical central entre `E` y `F` es blanca de `4 px`.
- El contorno del área verde es blanco de `8 px`.
- Las líneas especiales simétricas respecto al eje E–F son blancas de `5 px`.
- La división horizontal de la fila central es amarilla, delgada y punteada, de `2 px`.
- Las líneas de meta `LM` laterales de `A4` y `J4` son amarillas de `10 px`, sin relleno, con resplandor.
- El amarillo solo se aplica al trazo lateral de esas casillas; nunca al fondo completo.

## Franja simétrica

La franja blanca especial se refleja respecto al eje vertical E–F. Toda modificación de esta franja debe conservar:

- La misma distancia al eje en ambos lados.
- La misma fila de inicio y final.
- El mismo grosor de `5 px`.
- La continuidad visual de sus segmentos.
- El ancho del área (línea de área) es de `1 columna`: la columna `J` en el lado derecho y su espejo, la columna `A`, en el lado izquierdo. Cada área ocupa las filas `3` a `5`.
- En `B4` e `I4` hay un semicírculo blanco de `5 px` (mismo grosor que la línea de área). Su diámetro coincide exactamente con el tramo de la línea de área que cruza la fila `4`, y el arco sobresale hacia el centro de la cancha (alejándose del arco de gol).

## Centro de la cancha

- La línea magenta cruza horizontalmente la zona central.
- El círculo central está centrado en la intersección de la línea magenta y el eje E–F.
- El círculo no tiene relleno.
- Su radio corresponde a la dimensión de una casilla.
- El círculo tiene un borde blanco de `5 px` y conserva el efecto resplandeciente.

## Personaje y navegación

- El personaje se coloca dentro de la casilla activa.
- Su imagen ocupa exactamente los límites de esa casilla.
- El punto circular de navegación comparte el centro de la casilla activa.
- Las flechas de borde no son visibles.
- El movimiento se realiza con teclado y mediante la selección de celdas.
- Las capas interactivas no deben cambiar la geometría base de la cancha.

## Entorno de la interfaz

- La cancha ocupa la zona principal.
- La tabla de puntajes está en el sidebar derecho.
- Los jugadores conectados aparecen en la barra inferior horizontal.
- El encabezado superior muestra `CANCHA SINCRÓNICA INTERACTIVA LA GUACHA`.
- El cuadro Instrucciones está en la parte inferior del sidebar y ocupa aproximadamente una cuarta parte de su altura.
- El cuadro Instrucciones no es la fuente normativa de las reglas: la fuente normativa es este archivo Markdown.

## Objetos balón / pickup objects (PO)

Hay dos balones independientes, cada uno con su propia distancia de disparo y puntaje por gol:

| Balón | Forma | Casilla inicial | Distancia de disparo | Puntos por gol |
| --- | --- | --- | --- | --- |
| Balón blanco | Círculo, gradiente radial blanco→gris | `F4` | `2 casillas` | `5` |
| Balón amarillo | Óvalo, gradiente radial amarillo→dorado oscuro | `E4` | `3 casillas` | `7` |

- Ambos ocupan exactamente una casilla y comparten las mismas reglas de captura y disparo.
- Cuando el personaje camina sobre la casilla de un balón, este se "atrapa": queda fijo a la posición del personaje que lo recogió y se mueve junto con él en cada paso siguiente. Los dos balones pueden estar atrapados a la vez si el jugador pasó por ambas casillas.
- `X` ya no marca la casilla. Con al menos un balón atrapado, `X` dispara todos los balones atrapados a la vez, cada uno su propia distancia, a una velocidad de `1 casilla por decisegundo` (100 ms por casilla). Sin ningún balón atrapado, `X` no hace nada.
- El disparo es siempre unidireccional (nunca diagonal) y preciso: la dirección es la de la flecha sostenida en ese momento o, si ninguna está sostenida, la última dirección de movimiento del jugador — reducida siempre al eje dominante (arriba/abajo/izquierda/derecha), incluso si ese último movimiento vino de un clic en una casilla lejana o en diagonal.
- Al terminar el disparo (o si sale del tablero antes), el balón queda libre en su casilla final y puede volver a atraparse caminando sobre él.
- Cada vez que un balón cruza la línea de meta amarilla (`J4` o `A4`, es decir entra a la casilla de marco pegada a esa línea) suma sus puntos por gol al puntaje. Un mismo disparo solo puede anotar una vez por balón.
- El puntaje del jugador es únicamente esta suma de goles. Ocupar o visitar casillas, y presionar `X`, no otorgan puntos por sí solos.

## Acciones informativas

`Marcar O` y `Pintar` se muestran como referencias informativas no interactivas dentro de Instrucciones. Los atajos existentes son:

- `X`: disparar el balón atrapado (ver sección anterior).
- `O`: marcar con O.
- `Espacio`: pintar o cambiar el color de la casilla.

## Regla de mantenimiento

Antes de cambiar posiciones, dimensiones, colores, numeración o grosores, actualizar primero este documento. El cuadro visual Instrucciones solo debe cambiar si se solicita explícitamente modificar su contenido o presentación.
