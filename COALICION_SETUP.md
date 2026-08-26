# Activación del dashboard Coalición Venezuela

El dashboard se publica como una página paralela y adaptable a teléfonos:

`/Dashboard-Gestion-y-Seguimiento/evento-coalicion-venezuela.html`

La consulta abre directamente, sin cuentas. La edición y los datos completos de contacto requieren una clave operativa compartida.

## 1. Crear la estructura en Supabase

1. Abrir el proyecto Supabase utilizado por el repositorio.
2. Ir a **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar y ejecutar todo el contenido de `supabase_coalicion_setup.sql`.

El script no contiene datos personales ni la clave real.

La función `supabase/functions/coalicion-editor/index.ts` también debe desplegarse con `verify_jwt = false`, como indica `supabase/config.toml`. La función implementa su propia validación de la clave compartida antes de leer datos privados o escribir.

## 2. Definir la clave de edición

Al final de `supabase_coalicion_setup.sql` hay una sentencia comentada para definir o cambiar la clave.

1. Copiar esa sentencia en una consulta privada.
2. Sustituir `REEMPLAZAR_CON_CLAVE_SEGURA` por la clave acordada.
3. Ejecutarla en Supabase.
4. No guardar la clave real en GitHub, Notion, capturas públicas ni el código HTML.

Utilizar al menos 12 caracteres. Puede ser una frase corta fácil de recordar para el equipo, combinada con números.

Supabase guarda únicamente el hash bcrypt de la clave.

## 3. Funcionamiento de los accesos

- **Vista pública:** resumen, calendario, inventario, lotes y nombre/rol de los contactos.
- **Edición activa:** creación y modificación de registros, además de cédula, teléfono, correo y notas de contacto.
- **Bloquear edición:** elimina la clave de la memoria de la página y vuelve a la consulta pública.
- **Actualizar la página:** también elimina la clave y exige ingresarla nuevamente para editar.

La interfaz no compara la clave en JavaScript. La función de borde `coalicion-editor` la envía al servidor y Supabase la verifica nuevamente en cada operación de guardado. Las funciones internas de base de datos no son ejecutables por visitantes públicos.

## 4. Cargar la información inicial

1. Abrir el dashboard desde el teléfono o computadora.
2. Presionar **Activar edición**.
3. Ingresar la clave operativa.
4. Agregar el evento con fecha, hora, ubicación, estado e indicaciones.
5. Agregar los responsables en **Contactos**.
6. Registrar los artículos y cantidades en **Inventario del evento**.
7. Crear los grupos en **Lotes**, con un mínimo de 15 personas por lote.

Los lotes registran cantidades y coordinación. No deben incluir nombres, cédulas ni información médica de beneficiarios.

## 5. Verificación mínima

- La página abre sin pantalla de inicio de sesión.
- La consulta funciona en teléfono y computadora.
- La vista pública no muestra cédulas, teléfonos, correos ni notas privadas.
- Una escritura directa contra las tablas es rechazada por Supabase.
- Una clave incorrecta no activa la edición.
- Una clave correcta permite guardar y ver el cambio desde otro dispositivo.
- Al bloquear la edición, los datos completos de contacto dejan de mostrarse.
- Ninguna clave o dato real aparece en los archivos HTML, CSS, JavaScript o SQL del repositorio.
