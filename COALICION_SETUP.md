# Activación del dashboard Coalición Venezuela

El dashboard se publica como una página paralela y adaptable a teléfonos:

`/Dashboard-Gestion-y-Seguimiento/evento-coalicion-venezuela.html`

La consulta y la edición operativa abren directamente, sin cuentas. Los datos sensibles de responsables conservan una clave compartida.

## 1. Crear la estructura en Supabase

1. Abrir el proyecto Supabase utilizado por el repositorio.
2. Ir a **SQL Editor**.
3. Crear una consulta nueva.
4. Copiar y ejecutar todo el contenido de `supabase_coalicion_setup.sql`.

El script no contiene datos personales.

La función `supabase/functions/coalicion-editor/index.ts` debe desplegarse con `verify_jwt = false`, como indica `supabase/config.toml`. La función mantiene una lista cerrada de operaciones y verifica la clave antes de leer o guardar datos sensibles.

## 2. Funcionamiento del acceso

- **Edición directa:** cualquier persona que abra la página puede crear o modificar eventos, inventario y lotes.
- **Responsables:** la pestaña muestra públicamente nombre y rol. Cédula, teléfono, correo y notas aparecen enmascarados.
- **Botón de ojo:** solicita la clave y revela únicamente el responsable seleccionado.
- **Crear responsable:** abre directamente y exige seleccionar **Pertenece a**. **Editar** un responsable existente conserva la clave.
- **Tablas:** las escrituras anónimas directas permanecen bloqueadas; el dashboard guarda mediante la función de borde.

Este modelo combina movilidad operativa con protección de los datos personales.

## 3. Cargar la información inicial

1. Abrir el dashboard desde el teléfono o computadora.
2. Agregar el evento con fecha, hora, dirección o enlace de Maps, estado e indicaciones.
3. Agregar el equipo en **Responsables**. La clave solo se solicita al revelar o editar un registro existente.
4. Registrar los artículos y cantidades en **Inventario del evento**.

La pestaña **Resultados** no se alimenta desde aquí — se llena sola desde conektados Lite (ver sección 3b).

## 3b. Activar "Resultados de la jornada" (conektados Lite)

La pestaña **📊 Resultados** consulta la API externa de solo lectura de conektados Lite (`docs/api-lite-externo.md`) a través de una función de borde propia, `supabase/functions/lite-resultados`, para que el token nunca quede visible en el navegador.

1. Desplegar la función (requiere la CLI de Supabase con sesión iniciada y vinculada a este proyecto):
   ```
   supabase functions deploy lite-resultados
   ```
2. Configurar los dos secretos que la función necesita (pedir el token a quien administra conektados Lite):
   ```
   supabase secrets set LITE_API_BASE_URL=https://dominio-real-de-lite.example
   supabase secrets set LITE_API_EXTERNAL_TOKEN=el_token_real
   ```
3. Mientras esos dos secretos no estén configurados, la pestaña Resultados muestra un aviso claro ("conektados Lite no está configurado todavía") en vez de fallar en silencio.
4. Si el dominio o el token cambian más adelante, basta con volver a correr el `supabase secrets set` correspondiente — no hay que tocar ni redesplegar el código.

Esta función solo hace lecturas (`GET`) hacia Lite; no escribe ni modifica nada en su base de datos.

## 4. Verificación mínima

- La página abre sin pantalla de inicio de sesión ni solicitud general de clave.
- Los botones para agregar y editar aparecen de inmediato en teléfono y computadora.
- La pestaña y los formularios usan el término **Responsables**.
- Los datos sensibles permanecen enmascarados hasta pulsar el ojo e ingresar una clave válida.
- Una escritura directa contra las tablas es rechazada por Supabase.
- La función de borde permite guardar y ver el cambio desde otro dispositivo.
- Ningún dato real aparece escrito en los archivos HTML, CSS, JavaScript o SQL del repositorio.
