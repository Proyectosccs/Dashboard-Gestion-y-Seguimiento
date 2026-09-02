(function () {
  'use strict';

  const SUPABASE_URL = 'https://hcylkagvwfncdaaizutn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_E-cV9DiNK9rctFCxzondvA_7OppBD7Y';
  const EDITOR_FUNCTION_URL = SUPABASE_URL + '/functions/v1/coalicion-editor';
  const LITE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/lite-resultados';
  const TABLES = {
    contacts: 'coalicion_contacts',
    events: 'coalicion_events'
  };
  const SEMAFORO_META = {
    Verde: { key: 'verde', label: 'Verde · Habitable', color: 'var(--coalition-good)', soft: 'var(--coalition-good-soft)' },
    Amarillo: { key: 'amarillo', label: 'Amarillo · Riesgo moderado/restringido. Se puede reparar', color: 'var(--coalition-warning)', soft: 'var(--coalition-warning-soft)' },
    Rojo: { key: 'rojo', label: 'Rojo · Inseguro/demolición. Pérdida total', color: 'var(--coalition-danger)', soft: 'var(--coalition-danger-soft)' },
    Colapso: { key: 'colapso', label: '⚫ Colapso · La edificación colapsó', color: 'var(--coalition-collapse)', soft: 'var(--coalition-collapse-soft)' }
  };
  const SEMAFORO_KEYS = ['Verde', 'Amarillo', 'Rojo', 'Colapso'];
  // El estatus real llega como texto libre ("sin inspección", "casa destruida"...)
  // además de los 3 colores oficiales — cuando alguien reporta que la
  // edificación colapsó, se cuenta aparte en vez de mezclarse con "Rojo".
  function classifySemaforo(rawStatus) {
    const status = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
    const text = String(status || '');
    if (/colaps/i.test(text)) return 'Colapso';
    return SEMAFORO_META[status] ? status : null;
  }
  // Categorías generales para condensar el texto libre de "necesidad" — cada
  // entrega puede pedir varias cosas distintas y con errores de tipeo, así que
  // agrupamos por palabras clave en vez de mostrar cada frase suelta. El orden
  // importa: se evalúan de arriba a abajo y gana la primera que coincida.
  const NEED_CATEGORIES = [
    { key: 'vivienda', icon: '🏠', label: 'Vivienda y refugio', test: /vivienda|donde vivir|carpa|inspeccion|rancho|colchoneta/i },
    { key: 'salud', icon: '🩺', label: 'Salud y medicamentos', test: /hipertensi|ipertension|losartan|diclofenac|asma|nebulizador|basartan|mecformina|amputaci|enfermedad|medicamento/i },
    { key: 'discapacidad', icon: '♿', label: 'Discapacidad y movilidad', test: /discapacita|silla de ruedas|autista|bast[oó]n|cardiac/i },
    { key: 'materno-infantil', icon: '🤰', label: 'Salud mental, embarazo y bebés', test: /salud mental|embarazo|beb[eé]|pa[ñn]al/i },
    { key: 'alimentacion', icon: '🍲', label: 'Alimentación y agua', test: /aliment|comida|agua/i },
    // Cuidado personal, adultos mayores, cuidado infantil, "sin necesidad" y
    // cualquier texto libre que no calce con las categorías de arriba quedan
    // agrupados aquí — cada uno por separado era demasiado chico para leerse
    // bien en la gráfica de barras.
    { key: 'otras', icon: '📋', label: 'Otros cuidados y necesidades', test: /^/ }
  ];

  function classifyNeed(text) {
    for (let i = 0; i < NEED_CATEGORIES.length; i++) {
      if (NEED_CATEGORIES[i].test.test(text)) return NEED_CATEGORIES[i];
    }
    return NEED_CATEGORIES[NEED_CATEGORIES.length - 1];
  }

  const NUCLEO_BRACKETS = [
    { key: '1-2', label: '1–2 personas', test: function (t) { return t <= 2; } },
    { key: '3-4', label: '3–4 personas', test: function (t) { return t >= 3 && t <= 4; } },
    { key: '5-6', label: '5–6 personas', test: function (t) { return t >= 5 && t <= 6; } },
    { key: '7+', label: '7 o más', test: function (t) { return t >= 7; } }
  ];

  // === BLOQUE TEMPORAL DE DEMOSTRACIÓN — quitar junto con USE_STATIC_DEMO_DATA
  // cuando el departamento de IT despliegue la conexión real a la API de Lite ===
  // Snapshot estático de conektados Lite en producción (2026-08-28T12:55:55Z).
  // Nombre, cédula y teléfono de los beneficiarios NUNCA se incluyen aquí — esta
  // pantalla tampoco los muestra en ningún lado, así que no hacía falta guardarlos.
  const USE_STATIC_DEMO_DATA = false;
  const STATIC_DEMO_ENVIOS = [
    { totalCajas: 100, totalEntregado: 10, estadoPaquete: 'despachado' },
    { totalCajas: 200, totalEntregado: 200, estadoPaquete: 'entregado' }
  ];
  // Cada fila: [adultos, niños, cajas, confirmadoRecibido, necesidades[], ubicacionActual, statusVivienda]
  // statusVivienda tal como lo registró quien hizo el levantamiento — muchas filas usan texto libre
  // ("sin inspección", "casa destruida"...) en vez de Rojo/Amarillo/Verde; no se corrigió ese texto.
  const STATIC_DEMO_ENTREGAS_RAW = [
    [2,0,1,true,["Ayuda reparando vivienda actual"],"","Amarillo"],
    [2,0,1,true,["En búsqueda de lugar donde vivir","Necesitan una colchoneta"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [3,1,1,true,["En búsqueda de lugar donde vivir","Ayuda con tratamiento para la hipertensión"],"","Sin inspección"],
    [4,2,1,true,["Ayuda reparando vivienda actual","Alimentos"],"Parroquia Naiguatá, Municipio Vargas, Estado Vargas, 1166, Venezuela","No ha sido inspeccionado"],
    [2,0,1,null,["Cuidados de Enfermedades post terremoto"],"Avenida Catia La Mar, Las Angustias, La Páez, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [4,1,1,null,["Alimentos","Ayuda reparando vivienda actual"],"","Amarillo"],
    [2,2,1,true,["Alimentos"],"Maiquetía, Parroquia Maiquetía, Municipio Vargas, Estado Vargas, 1161, Venezuela","Verde"],
    [2,2,1,true,["Alimentos","Necesidades de salud mental o Embarazo"],"Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [1,1,1,null,["En búsqueda de lugar donde vivir"],"","Rojo"],
    [2,4,1,null,["Cuidados de Enfermedades post terremoto"],"La sublete la guaira","Rojo"],
    [2,1,1,null,["Alimentos"],"La Páez, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Sin inspeccionar"],
    [2,3,1,null,["Ayuda reparando vivienda actual"],"Calle Real de Playa Verde, Ciudad Chávez, Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,0,1,true,["Necesidades de salud mental o Embarazo","Ropa y cosas para el bebé esposa embarazada"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [3,3,1,null,["Alimentos"],"Barrio Aeropuerto, Mantecal, Parroquia Mantecal, Municipio Muñoz, Estado Apure, Venezuela","Amarillo"],
    [3,3,1,true,["Ayuda reparando vivienda actual"],"Canaima, Parroquia Carlos Soublette, Municipio Vargas, Estado Vargas, Venezuela","Amarillo"],
    [4,0,1,null,["Persona autista y persona con problemas cardiacos"],"La Lucha, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","No inspeccionada"],
    [1,1,1,null,["Alimentos"],"Sector la esperanza la guiara","Verde"],
    [2,2,1,true,["Ayuda reparando vivienda actual","Necesidades de salud mental o Embarazo","En búsqueda de lugar donde vivir"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [9,5,1,null,["Alimentos"],"Plaza los negros la guaira","Amarillo"],
    [1,3,1,null,["Alimentos","En búsqueda de lugar donde vivir"],"Barrio aeropuerto la guaira","Verde"],
    [3,3,1,null,["Cuidados de Enfermedades post terremoto"],"Las Angustias, La Páez, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,1,1,null,["Ayuda reparando vivienda actual","Alimentos"],"Parroquia Naiguatá, Municipio Vargas, Estado Vargas, 1166, Venezuela","Verde"],
    [6,5,1,true,["Ayuda reparando vivienda actual"],"","Rojo"],
    [4,5,1,null,["Ayuda reparando vivienda actual"],"Avenida Tacagua, Las Angustias, La Páez, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,2,1,null,["Alimentos","Cuidado personal de amputación o de familiar amputado"],"Playa Grande, Parroquia Bolívar, Municipio Bermúdez, Estado Sucre, 0294, Venezuela","Rojo"],
    [1,0,1,null,["Alimentos"],"Feria de Frutas Verduras y Horralizas, Calle 9, La Atlántida, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,1,1,null,["Ayuda reparando vivienda actual"],"","Amarillo"],
    [10,6,4,null,["Alimentos"],"Mare abajo sector casa blanca","Verde"],
    [2,2,1,null,["En búsqueda de lugar donde vivir"],"Ciudad Chávez, Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rancho precario"],
    [2,3,1,null,["Cuidados de Enfermedades post terremoto","Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [1,2,1,true,["Alimentos","Ayuda reparando vivienda actual","Comida sin gluten"],"","Amarillo"],
    [2,2,1,null,["En búsqueda de lugar donde vivir"],"","Rojo"],
    [2,1,1,null,["Alimentos"],"Farmatodo, Avenida Central de Playa Grande, Ciudad Chávez, Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [1,0,1,null,["Alimentos"],"Marea bajo plaza los negros","Rojo"],
    [5,1,1,null,["Alimentos","Necesidades de salud mental o Embarazo"],"Miraban la guaira","Verde"],
    [4,2,1,true,["En búsqueda de lugar donde vivir"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [3,0,1,null,["Alimentos"],"Ciudad Chávez, La Lucha, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,0,1,null,["Alimentos"],"Guaracarumbo, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,0,1,null,["Alimentos","Cuidados para adultos mayores"],"Guaracaru la guaria","Amarillo"],
    [1,3,1,true,["Alimentos","Ayuda reparando vivienda actual"],"Avenida Bicentenaria, Urbanización José María Vargas, Pariata, Parroquia Carlos Soublette, Municipio Vargas, Estado Vargas, Venezuela","Rojo"],
    [4,2,1,null,["En búsqueda de lugar donde vivir"],"Estadio César Nieves, Pasarela, Las Angustias, La Páez, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [1,1,1,null,["Alimentos"],"Guaracarumbo, Week-End, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,5,2,null,["Alimentos"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Colapsada"],
    [3,0,1,null,["Ayuda reparando vivienda actual","Alimentos"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [1,0,1,true,["Alimentos"],"El Respiro, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,2,1,null,["En búsqueda de lugar donde vivir"],"Avenida Principal de Playa Grande, Ciudad Chávez, Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","casa destruida"],
    [1,3,1,null,["Alimentos"],"Marea bajo la guaira","Rojo"],
    [1,0,1,null,["Alimentos","Ayuda reparando vivienda actual"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [1,0,1,null,["Alimentos","Envases de agua"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,3,1,null,["Alimentos"],"Calle real barrio abajo la guaira","Amarillo"],
    [4,1,1,null,["Alimentos"],"La Veguita, Week-End, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,0,1,null,["Alimentos"],"Casa blanca la guaira","Verde"],
    [2,1,1,true,["En búsqueda de lugar donde vivir"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,0,1,null,["Ipertension"],"Caracas, Urbanización Kennedy, Parroquia Macarao, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, 1000, Venezuela","Rojo"],
    [1,1,1,null,["Alimentos"],"Casa blanca la guaira","Amarillo"],
    [2,0,1,null,["Alimentos","Ayuda reparando vivienda actual","Necesita inspeccionar su casa urgente"],"Parte alta de Canaima mayongo","Sin etiqueta pero graves condiciones"],
    [3,1,1,true,["Alimentos","Necesidades de salud mental o Embarazo"],"Parada Barrio Aeropuerto, Avenida La Armada, Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Ninguna certificación, la vivienda está bien"],
    [2,0,1,true,["Ayuda reparando vivienda actual"],"","Amarillo"],
    [4,3,1,null,["mecformina y basartan 80 ml"],"Summa, Vía Alterna a Playa Grande, Ciudad Chávez, La Lucha, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","sin inspeccionar"],
    [2,1,1,true,["Alimentos"],"Campamento transitorio república salvador","Desplomada"],
    [4,2,1,true,["Alimentos","Ayuda reparando vivienda actual"],"","Sin inspección"],
    [3,0,1,null,["Alimentos"],"Calle 6, Ciudad Chávez, Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","sin inspeccionar"],
    [6,1,1,true,["Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,0,1,null,["Alimentos"],"Barrio aeropuerto la guaira","Amarillo"],
    [2,1,1,null,["Ayuda reparando vivienda actual"],"La Esperanza, Terrazas de Alto Picure, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","casa no inspeccionada"],
    [1,1,1,true,["Alimentos","Pañales para bebé de dos años"],"San Miguel arcángel, el barrio lo puerto","No tiene certificación pero tiene grietas la vivienda"],
    [1,2,1,null,["Alimentos"],"Barrio aeropuerto","Amarillo"],
    [2,2,1,null,["niños asmaticos"],"Caracas, Ciudad Caribia, Parroquia Carayaca, Municipio Vargas, Distrito Metropolitano de Caracas, Estado Vargas, 1167, Venezuela","rancho precario"],
    [3,1,1,null,["Ayuda reparando vivienda actual","Alimentos","Artículos de uso personal"],"","Sin inspección"],
    [2,1,1,null,["Rancho precario"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rancho precario"],
    [2,4,1,null,["Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Verde"],
    [1,3,1,true,["Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,4,1,null,["En búsqueda de lugar donde vivir"],"Caracas, Monte Alto, Parroquia El Junquito, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, 1000, Venezuela","vivienda precaria"],
    [2,2,1,null,["En búsqueda de lugar donde vivir"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [3,2,1,null,["En búsqueda de lugar donde vivir"],"El Piache, Terrazas de Alto Picure, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","casa destruida"],
    [4,0,1,true,["Alimentos"],"","Amarillo"],
    [2,3,1,true,["Alimentos"],"Macuto, Parroquia Macuto, Municipio Vargas, Estado Vargas, 1164, Venezuela","Amarillo"],
    [3,0,1,null,["Alimentos"],"Carallaca la guaira","Verde"],
    [2,1,1,null,["Alimentos"],"Caracas, Parroquia Sucre, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, Venezuela","Verde"],
    [2,1,1,true,["Alimentos"],"Sector cardonal la guaira","Verde"],
    [1,2,1,true,["En búsqueda de lugar donde vivir","Alimentos"],"","Sin inspección"],
    [3,2,1,true,["Alimentos","En búsqueda de lugar donde vivir"],"Automac, Urbanización Caribe, Caraballeda, Parroquia Caraballeda, Municipio Vargas, Estado Vargas, 1165, Venezuela","Rojo"],
    [2,0,1,true,["En búsqueda de lugar donde vivir"],"","Sin inspección"],
    [4,0,1,null,["Alimentos"],"La Aviación, El Trébol, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Verde"],
    [4,3,1,null,["Necesidades de salud mental o Embarazo"],"El Piache, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","sin inspeccionar"],
    [2,2,1,true,["Alimentos"],"Maiquetía, Parroquia Maiquetía, Municipio Vargas, Estado Vargas, 1161, Venezuela","Amarillo"],
    [1,2,1,null,["ninguna"],"","sin inspeccionar"],
    [1,2,1,true,["Alimentos","Necesidades de salud mental o Embarazo","Niña autista no verbal necesita terapia"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,3,1,null,["Alimentos","En búsqueda de lugar donde vivir"],"Refugio hospital naval","Desplomada"],
    [1,2,1,null,["Alimentos"],"Carayaca, Parroquia Carayaca, Municipio Vargas, Estado Vargas, 1167, Venezuela","Verde"],
    [7,6,1,null,["Necesidades de salud mental o Embarazo","Cuidados de Enfermedades post terremoto"],"Los Olivos, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","no inspeccionada"],
    [3,1,1,true,["Alimentos","Suministros de higiene personal"],"Hospital San José, Calle Real de Maiquetía, Casco Central de Maiquetía, El Rincón, Maiquetía, Parroquia Maiquetía, Municipio Vargas, Estado Vargas, 1161, Venezuela","Ninguna certificación, se encuentra bien"],
    [2,2,1,true,["Alimentos"],"","Verde"],
    [2,1,1,null,["Necesidades de salud mental o Embarazo"],"Grupo Médico Catia La Mar, Calle 11, Las Angustias, La Atlántida, Catia La Mar, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Verde"],
    [1,3,1,null,["Alimentos"],"Sector el plan la guaira","Amarillo"],
    [2,2,1,true,["Alimentos","Cuidados de Enfermedades post terremoto"],"La guaira quebrada de german","Amarillo"],
    [2,5,1,null,["En búsqueda de lugar donde vivir"],"La Roraima, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,6,1,true,["Alimentos","Ayuda reparando vivienda actual"],"Navarrete la guaira","Rojo"],
    [5,3,1,true,["Alimentos","Ayuda reparando vivienda actual"],"","Sin inspección"],
    [1,1,1,null,["Cuidados de Enfermedades post terremoto"],"Caracas, Parroquia Sucre, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, Venezuela","Amarillo"],
    [3,6,2,null,["Alimentos"],"Barrio el aeropuerto la guaira","Amarillo"],
    [2,3,1,null,["En búsqueda de lugar donde vivir","3 asmaticos"],"Oripia, Los Cujíes, Parroquia Tácata, Municipio Guaicaipuro, Estado Miranda, 1211, Venezuela","Rojo"],
    [3,1,1,null,["Ayuda reparando vivienda actual","Alimentos","Diclofenac"],"Casa blanca, la Guaira","Rojo"],
    [5,2,1,null,["Alimentos"],"","Sin inspección"],
    [8,4,1,true,["Alimentos","Ayuda reparando vivienda actual"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [1,2,1,null,["Alimentos"],"Carallaca la guaira","Verde"],
    [1,0,1,null,["Alimentos","Ayuda reparando vivienda actual"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,1,1,true,["Ayuda reparando vivienda actual"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,3,1,true,["Alimentos"],"Casa blanca la guaira","Amarillo"],
    [2,0,1,null,["Alimentos","Ayuda para adultos mayores"],"Barrio aeropuerto la guaira","Casa desplomada"],
    [2,3,1,true,["En búsqueda de lugar donde vivir","Necesita carpa"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [3,1,1,null,["Ayuda reparando vivienda actual"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,4,1,null,["Cuidados de Enfermedades post terremoto","Losartan, astorbastartina, clopidogel y clorotisida"],"El Piache, Terrazas de Alto Picure, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","no inspeccionada"],
    [3,2,1,null,["Alimentos"],"Casa blanca la guaira","Rojo"],
    [3,1,1,null,["En búsqueda de lugar donde vivir"],"","Verde"],
    [2,0,1,null,["Alimentos"],"Plaza los negros la guaira","Rojo"],
    [4,3,1,null,["Alimentos"],"Avenida Carlos Soublette","Amarillo"],
    [1,2,1,null,["Alimentos","Cuidados personales"],"Santa eduviges la guaira","Amarillo"],
    [2,3,1,null,["Necesidades de salud mental o Embarazo","En búsqueda de lugar donde vivir"],"Guaremal, Parroquia Guaremal, Municipio Guaicaipuro, Estado Miranda, 1201, Venezuela","sin casa"],
    [2,0,1,null,["Ayuda reparando vivienda actual"],"Avenida Bicentenaria, Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,0,1,null,["Cuidados de Enfermedades post terremoto"],"Paso Morocho, Parroquia San Casimiro, Municipio San Casimiro, Estado Aragua, Venezuela","Rojo"],
    [2,4,1,true,["Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,3,1,null,["Ayuda reparando vivienda actual"],"Carretera Vieja Caracas - La Guaira, Pedro García, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,2,1,null,["Alimentos","Necesidades de salud mental o Embarazo"],"Maiquetía, Parroquia Maiquetía, Municipio Vargas, Estado Vargas, 1161, Venezuela","Amarillo"],
    [2,4,1,true,["Alimentos"],"","Sin inspección"],
    [3,0,1,null,["Alimentos"],"El Piache, Terrazas de Alto Picure, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","sin inspeccionar"],
    [4,0,1,true,["Alimentos"],"Aluminiologo La Guaira, 1161, Avenida Carlos Soublette, 10 de Marzo, Urbanización José María Vargas, Pariata, Parroquia Maiquetía, Municipio Vargas, Estado Vargas, 1161, Venezuela","Verde"],
    [3,1,1,true,["En búsqueda de lugar donde vivir","Alimentos","Necesitan nebulizador"],"Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Perdida de vivienda"],
    [1,3,1,null,["Alimentos","Ayuda reparando vivienda actual"],"Palo Negro, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, Venezuela","Amarillo"],
    [3,0,1,true,["Alimentos","Medicamento para asma"],"","Casa de laminas"],
    [3,1,1,null,["Alimentos","Cuiados para niña discapacitada"],"E, Avenida Aeropuerto Auxiliar, Sotavento I, Santa Eduvigis, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Verde"],
    [3,0,1,null,["Cuidados de Enfermedades post terremoto"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,2,1,null,["Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [4,1,1,null,["Alimentos","Cuidados para niña de 2 años"],"Barrio aeropuerto maiquetia la guaira","Amarillo"],
    [3,0,1,null,["Cuidados de Enfermedades post terremoto","Ayuda reparando vivienda actual"],"Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,1,1,true,["Alimentos","Hipertensa"],"Avenida Carlos Soublette, 10 de Marzo, Urbanización José María Vargas, Pariata, Parroquia Carlos Soublette, Municipio Vargas, Estado Vargas, Venezuela","Grietas y fracturas"],
    [2,2,1,true,["En búsqueda de lugar donde vivir"],"","Sin inspección"],
    [2,2,1,null,["Alimentos"],"Brisas del Aeropuerto, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,4,1,null,["Alimentos"],"Santa eduvijis Catia la mar","Sin inspeccionar"],
    [1,0,1,null,["Cuidados de Enfermedades post terremoto"],"Hotel Círculo Militar de Caracas, Paseo Los Próceres, Caracas, Barrio Las Malvinas, San Antonio, El Valle, Parroquia El Valle, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, 1040, Venezuela","no inspeccionada"],
    [3,3,1,null,["Alimentos"],"Caracas, Topo Arriba, Parroquia El Junquito, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, Venezuela","no inspeccionada"],
    [4,3,1,null,["Alimentos","Necesidades de salud mental o Embarazo"],"","Sin inspección"],
    [2,0,1,null,["Alimentos"],"Playa Los Cocos, Urbanización Caribe, La Guaira, Parroquia Caraballeda, Municipio Vargas, Estado Vargas, 1165, Venezuela","Rojo"],
    [2,1,1,null,["Alimentos"],"Iberia vía Carallaca","Amarillo"],
    [3,1,1,true,["Alimentos"],"Cardonado la guaira","Verde"],
    [2,0,1,true,["Alimentos"],"Autopista Caracas - La Guaira, Caracas, Parroquia Sucre, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, 1010, Venezuela","Amarillo"],
    [1,4,1,true,["Ayuda reparando vivienda actual"],"","Sin inspección"],
    [2,1,1,true,["Alimentos","Uso personales"],"Parroquia Urimare, Municipio Vargas, Estado Vargas, Venezuela","Ninguna certificación pero está bien"],
    [4,3,1,null,["Alimentos"],"Barrio aeropuerto la guaira","Amarillo"],
    [1,2,1,null,["Cuidados de Enfermedades post terremoto","Ayuda reparando vivienda actual"],"Caracas, Parroquia El Junquito, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, Venezuela","casa no inspeccionada"],
    [2,2,1,true,["En búsqueda de lugar donde vivir"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,2,1,true,["Alimentos"],"Barrio Aeropuerto, Mantecal, Parroquia Mantecal, Municipio Muñoz, Estado Apure, Venezuela","Amarillo"],
    [2,2,1,null,["Ayuda reparando vivienda actual"],"Carretera Paracotos - Tácata, Piedras Azules, Parroquia Tácata, Municipio Guaicaipuro, Estado Miranda, 1211, Venezuela","no inspeccionada"],
    [2,3,1,null,["Cuidados de Enfermedades post terremoto","Alimentos"],"La guaira barrio aeropuerto","Verde"],
    [2,2,1,true,["Alimentos","Necesidades de salud mental o Embarazo","2 discapacitados"],"","Sin inspección"],
    [4,0,1,true,["Alimentos"],"Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Verde"],
    [2,2,1,true,["En búsqueda de lugar donde vivir","Alimentos","Necesitan pañales de adultos y baston"],"","Rojo"],
    [8,4,1,true,["En búsqueda de lugar donde vivir"],"","Casa destruida"],
    [1,1,1,null,["En búsqueda de lugar donde vivir","Alimentos"],"Maiquetía, Parroquia Maiquetía, Municipio Vargas, Estado Vargas, 1161, Venezuela","Colapsada"],
    [2,2,1,null,["Ayuda reparando vivienda actual","Alimentos"],"","Casa de laminas"],
    [4,1,1,null,["Necesidades de salud mental o Embarazo"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","No esta inspeccionada"],
    [2,2,1,null,["Alimentos"],"Los Corales, Caraballeda, Parroquia Caraballeda, Municipio Vargas, Estado Vargas, 1165, Venezuela","Amarillo"],
    [2,2,1,null,["Ayuda reparando vivienda actual"],"Túnel Boquerón I, Salto Boquerón, Catia La Mar, Parroquia Urimare, Municipio Vargas, Distrito Metropolitano de Caracas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,3,1,true,["En búsqueda de lugar donde vivir","Alimentos"],"Carlos Soublette","Rojo"],
    [1,3,1,null,["Cuidados de Enfermedades post terremoto","Alimentos"],"Malboro","Todavía sin evaluar"],
    [3,0,1,true,["En búsqueda de lugar donde vivir"],"","Rojo"],
    [2,4,1,true,["Alimentos"],"Montesano, El Trébol, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,3,1,null,["En búsqueda de lugar donde vivir"],"Río Arriba, Parroquia Tácata, Municipio Guaicaipuro, Estado Miranda, 1211, Venezuela","Rojo"],
    [3,1,1,true,["Alimentos"],"Refugio transitorio","Rojo"],
    [5,2,1,true,["En búsqueda de lugar donde vivir","Alimentos","Cuidado personal de amputación o de familiar amputado"],"Montesano, El Trébol, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Perdió la vivienda"],
    [1,2,1,true,["Alimentos"],"OPPE 25, Avenida Principal de Caribe, Tanaguarena, Caraballeda, Parroquia Caraballeda, Municipio Vargas, Estado Vargas, 1165, Venezuela","Rojo"],
    [2,1,1,null,["En búsqueda de lugar donde vivir"],"Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,4,1,true,["Alimentos"],"Las Tunitas, Terrazas de Alto Picure, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,1,1,null,["Alimentos"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Verde"],
    [2,1,1,null,["Alimentos","Ayuda reparando vivienda actual"],"Aeropuerto Internacional de Maiquetía Simón Bolívar, Avenida La Armada, Sotavento II, Santa Eduvigis, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,3,1,true,["Ayuda reparando vivienda actual"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,0,1,null,["Alimentos","Cuidados de Enfermedades post terremoto","Hipertensión cuidados"],"Carallaca la guaira","Amarillo"],
    [2,1,1,null,["Alimentos"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [6,3,1,null,["Ayuda reparando vivienda actual"],"Parroquia Urimare, Municipio Vargas, Estado Vargas, Venezuela","Ninguna"],
    [2,2,1,null,["Ayuda reparando vivienda actual","Cuidados de Enfermedades post terremoto"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [3,2,1,null,["En búsqueda de lugar donde vivir"],"","Rojo"],
    [6,4,2,null,["Alimentos"],"Santa eduvijis la guaira","Amarillo"],
    [2,2,1,null,["Cuidados de Enfermedades post terremoto"],"Caracas, Parroquia Sucre, Municipio Libertador, Distrito Metropolitano de Caracas, Distrito Capital, Venezuela","Rojo"],
    [3,1,1,null,["Alimentos"],"Paro curimare santa eduvijis sector 1","Verde"],
    [6,4,1,null,["Ayuda reparando vivienda actual","Cuidados de Enfermedades post terremoto"],"Hospital Dermatológico Martín Vegas, Avenida Fundación Mendoza, Urbanización Martín Vegas, Week-End, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,1,1,null,["En búsqueda de lugar donde vivir"],"","No apta"],
    [2,1,1,true,["Alimentos"],"Res Ana Victoria. La guaira","Verde"],
    [4,4,1,null,["En búsqueda de lugar donde vivir"],"El Piache, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Casa destruida"],
    [5,1,1,true,["Ayuda reparando vivienda actual"],"","Sin inspección"],
    [2,4,1,null,["Alimentos"],"Autopista Caracas - La Guaira, La Aviación, El Trébol, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [2,1,1,null,["Alimentos"],"Mare, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Médicos. Tomografía cervical"],
    [2,1,1,null,["Alimentos"],"Santa eduvijis la guaira","Amarillo"],
    [5,3,1,null,["Alimentos"],"Carretera San Casimiro - Güiripa, El Horno, Parroquia Güiripa, Municipio San Casimiro, Estado Aragua, Venezuela","Verde"],
    [2,2,1,null,["Alimentos"],"Avenida La Armada, La Veguita, Week-End, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [6,6,1,null,["En búsqueda de lugar donde vivir"],"","Amarillo"],
    [3,0,1,null,["Ayuda reparando vivienda actual","Cuidados de Enfermedades post terremoto"],"Calle 6, Ciudad Chávez, Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [1,2,1,true,["Alimentos"],"Atanacio","Rojo"],
    [1,1,1,null,["En búsqueda de lugar donde vivir"],"Avenida Fundación Mendoza, Urbanización Martín Vegas, Week-End, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [3,0,1,null,["Alimentos"],"Autopista Caracas - La Guaira, La Aviación, El Trébol, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Amarillo"],
    [6,3,1,null,["Necesita una silla de ruedas"],"","Verde"],
    [2,1,1,true,["Alimentos"],"La guaira c","Rojo"],
    [2,3,2,null,["Alimentos"],"Valle La Cruz, Ezequiel Zamora, Parroquia Catia La Mar, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"],
    [2,0,1,null,["Alimentos"],"Playa Grande, Catia La Mar, Parroquia Urimare, Municipio Vargas, Estado Vargas, 1162, Venezuela","Rojo"]
  ];
  // Coordenadas (lat, lng) de cada entrega en el mismo orden que STATIC_DEMO_ENTREGAS_RAW —
  // alimentan el mapa de "Zonas atendidas" en la demo estática.
  const STATIC_DEMO_LATLNG = [null,[10.611691,-6],null,[10.588122,-66.670395],[10.60126,-67.02467],null,[10.596607,-66.959755],[10.608837,-6],null,null,[10.599235,-67.0245],[10.610242,-67.02673],[10.607516,-66.97264],[7.5605035,-69.1429],[10.594429,-66.973045],[10.607684,-67.0287],null,[10.607376,-66.97245],null,null,[10.598138,-67.024155],[10.588122,-66.670395],null,[10.602862,-67.024414],[10.654413,-63.284912],[10.604506,-67.02948],null,null,[10.608465,-67.02038],[10.592714,-67.00432],null,null,[10.607711,-67.020035],null,null,[10.607206,-66.97288],[10.606302,-67.02399],[10.5706415,-66.99266],null,[10.602088,-6],[10.602989,-67.02296],[10.593008,-67.014595],[10.607449,-66.9795],[10.607454,-66.9723],[10.595103,-67.02347],[10.607503,-67.0245],null,[10.607125,-66.97293],[10.607087,-66.97723],null,[10.596663,-67.0154],null,[10.607455,-66.9723],[10.424254,-67.022095],null,null,[10.594275,-67.00289],null,[10.604237,-67.0269],null,null,[10.607947,-67.01274],[10.592714,-67.00432],null,[10.563337,-67.06879],null,null,[10.529586,-67.04132],null,[10.571438,-67.013855],[10.592714,-67.00432],[10.592714,-67.00432],[10.466839,-67.02347],[0.6074823,-66.973595],[10.567388,-67.04132],null,[10.606475,-66.89229],null,[10.561988,-67.02484],null,null,[10.6139555,-66.84436],null,[10.595826,-66.98377],[10.575488,-67.04407],[10.596607,-66.959755],null,[10.607204,-66.97289],null,[10.529354,-67.12044],[10.575488,-67.03308],[10.595976,-66.95709],null,[10.602897,-67.02965],null,null,[10.57553,-67.030334],[10.603138,-66.99668],null,[10.554605,-67.030334],null,[10.2242985,-67.030334],[10.597175,-6],null,[10.606651,-66.979774],null,[10.607154,-66.97893],[10.607206,-66.97288],null,null,[10.607087,-66.97723],[10.607468,-66.97312],[10.5640545,-67.03308],null,null,null,null,null,[10.302674,-67.01111],[10.607453,-66.972305],[9.994464,-67.038574],[10.592714,-67.00432],[10.570805,-66.99051],[10.596607,-66.959755],null,[10.556587,-67.03308],[10.599412,-66.96293],[10.582718,-67.0174],[10.408047,-67.046814],null,[10.598361,-66.99034],[10.572787,-67.03308],[10.592714,-67.00432],null,[10.748234,-67.005615],[10.599607,-66.96503],null,[10.592714,-67.00432],null,[10.465868,-66.89575],[10.521484,-67.0166],null,[10.617287,-66.8384],null,null,[10.519344,-66.945114],null,[10.589096,-66.998924],null,[10.526252,-67.005615],[10.607206,-66.97288],[7.5605035,-69.1429],[10.216189,-67.00287],null,null,[10.599267,-67.01451],null,[10.815686,-67.013855],[10.596607,-66.959755],null,[10.580255,-67.02072],[10.613524,-66.85653],[10.564688,-67.005615],null,null,null,[10.594707,-66.97811],[10.143199,-67.01111],null,[10.594707,-66.97811],[10.611735,-66.829865],[10.674736,-67.01111],[10.588694,-67.0637],[10.58093,-67.01935],[10.603138,-66.99668],[10.606913,-66.976234],null,[10.584305,-67.01248],[10.589096,-66.998924],[10.587005,-67.017975],null,null,[10.541653,-67.0166],null,[10.587637,-67.0166],null,null,[10.572787,-67.04407],null,[10.575488,-66.997375],[10.606651,-66.979774],null,[10.020075,-67.01111],[10.602212,-67.015915],null,[10.603203,-67.01111],null,[10.584937,-67.013855],[10.583588,-66.99463],null,null,[10.58363,-67.009735],[10.608837,-67.01599]];
  const STATIC_DEMO_ENTREGAS = STATIC_DEMO_ENTREGAS_RAW.map(function (row, i) {
    const coords = STATIC_DEMO_LATLNG[i];
    return {
      composicionAdultos: row[0], composicionNinos: row[1], cantidadPaquetes: row[2],
      confirmadoRecibido: row[3], necesidad: row[4], ubicacionActual: row[5], statusVivienda: row[6],
      ubicacionLat: coords ? coords[0] : null, ubicacionLng: coords ? coords[1] : null
    };
  });
  // === FIN BLOQUE TEMPORAL DE DEMOSTRACIÓN ===

  const EVENT_STATUS = {
    planned: 'Planificado',
    confirmed: 'Confirmado',
    in_progress: 'En ejecución',
    completed: 'Completado'
  };
  const AFFILIATIONS = {
    '': 'Selecciona una opción',
    'Coalicion con amor a Venezuela': 'Coalicion con amor a Venezuela',
    'Fundacion Ingenia': 'Fundacion Ingenia',
    'Voluntariado AVAA': 'Voluntariado AVAA',
    'ADRA': 'ADRA',
    'Nodos Venezuela': 'Nodos Venezuela',
    'Voluntario Particular': 'Voluntario Particular'
  };
  const AFFILIATION_CLASSES = {
    'Coalicion con amor a Venezuela': 'affiliation-coalicion',
    'Fundacion Ingenia': 'affiliation-ingenia',
    'Voluntariado AVAA': 'affiliation-avaa',
    'ADRA': 'affiliation-adra',
    'Nodos Venezuela': 'affiliation-nodos',
    'Voluntario Particular': 'affiliation-particular'
  };
  // Logos reales por afiliación — alimentan la franja de colaboradores del
  // Resumen y los avatares de Responsables. Mientras una afiliación no tenga
  // entrada aquí, no aparece en la franja (no se mezclan logos con iniciales).
  const AFFILIATION_LOGOS = {
    'Coalicion con amor a Venezuela': './assets/logos/coalicion.jpeg',
    'ADRA': './assets/logos/adra.png',
    'Fundacion Ingenia': './assets/logos/ingenia.jpeg',
    'Nodos Venezuela': './assets/logos/nodos-venezuela.jpeg'
  };
  // conektados Lite no es una afiliación de un responsable — es la plataforma
  // que alimenta los Resultados — así que su logo va siempre en la franja,
  // sin depender de que algún contacto la tenga asignada.
  const FIXED_COLLABORATOR_LOGOS = [
    { key: 'conektados', logo: './assets/logos/conektados.jpeg', alt: 'conektados Lite' }
  ];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const state = {
    client: null,
    view: 'summary',
    calendarMonth: new Date().toISOString().slice(0, 7),
    contacts: [],
    revealedContacts: {},
    events: [],
    query: '',
    keyRequest: null,
    keyRequestCounter: 0,
    keyTrigger: null,
    sensitiveEditorKey: '',
    editor: null,
    editorDirty: false,
    discardArmed: false,
    realtime: null,
    loadId: 0,
    results: { loading: false, error: null, loaded: false, entregas: [], envios: [], semaforoFilter: null, needsData: [], openNeedCategory: null, selectedJornada: null, jornadaAnchored: false },
    map: null,
    mapMarkers: null
  };

  const dom = {};

  document.addEventListener('DOMContentLoaded', init);

  window.coalicionAction = function (event) {
    event.stopPropagation();
    const target = event.currentTarget;
    if (!target) return;
    if (target.dataset.view) return setView(target.dataset.view);
    if (target.dataset.action) return handleAction(target.dataset.action, target.tagName === 'SELECT' ? target.value : target.dataset.id);
    const actionsById = {
      'retry-load': loadAllData,
      'calendar-prev': function () { changeMonth(-1); },
      'calendar-next': function () { changeMonth(1); },
      'calendar-today': function () { state.calendarMonth = new Date().toISOString().slice(0, 7); renderCalendar(); },
      'contact-search-clear': clearContactSearch,
      'key-dialog-close': closeKeyDialog,
      'key-dialog-cancel': closeKeyDialog,
      'toggle-editor-key': toggleEditorKey,
      'dialog-close': requestCloseEditor,
      'dialog-cancel': requestCloseEditor
    };
    const action = actionsById[target.id];
    if (action) action();
  };

  function init() {
    cacheDom();
    bindStaticEvents();
    if (!window.supabase || !SUPABASE_URL || !SUPABASE_KEY) return showConnectionFailure();

    state.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    loadAllData();
    subscribeRealtime();
    fetchResultados(false);
  }

  function cacheDom() {
    dom.appShell = document.getElementById('app-shell');
    dom.sessionName = document.getElementById('session-name');
    dom.sessionRole = document.getElementById('session-role');
    dom.loadingState = document.getElementById('loading-state');
    dom.connectivityBanner = document.getElementById('connectivity-banner');
    dom.retryLoad = document.getElementById('retry-load');
    dom.summaryResults = document.getElementById('summary-results');
    dom.summaryResultsGrid = document.getElementById('summary-results-grid');
    dom.summaryTeamList = document.getElementById('summary-team-list');
    dom.nextEventCard = document.getElementById('next-event-card');
    dom.headerEventDatetime = document.getElementById('header-event-datetime');
    dom.calendarMonthLabel = document.getElementById('calendar-month-label');
    dom.calendarGrid = document.getElementById('calendar-grid');
    dom.contactSearch = document.getElementById('contact-search');
    dom.contactSearchClear = document.getElementById('contact-search-clear');
    dom.contactResultCount = document.getElementById('contact-result-count');
    dom.contactsList = document.getElementById('contacts-list');
    dom.resultsStatus = document.getElementById('results-status');
    dom.resultsEmpty = document.getElementById('results-empty');
    dom.resultsBody = document.getElementById('results-body');
    dom.resultsRefresh = document.getElementById('results-refresh');
    dom.resultsKpiGrid = document.getElementById('results-kpi-grid');
    dom.resultsJornadaPicker = document.getElementById('results-jornada-picker');
    dom.resultsJornadaSelect = document.getElementById('results-jornada-select');
    dom.resultsSemaforo = document.getElementById('results-semaforo');
    dom.resultsSemaforoBar = document.getElementById('results-semaforo-bar');
    dom.resultsFilterPill = document.getElementById('results-filter-pill');
    dom.resultsZoneList = document.getElementById('results-zone-list');
    dom.resultsMap = document.getElementById('results-map');
    dom.resultsNeeds = document.getElementById('results-needs');
    dom.resultsNucleos = document.getElementById('results-nucleos');
    dom.resultsInsights = document.getElementById('results-insights');
    dom.resultsRecommendations = document.getElementById('results-recommendations');
    dom.keyDialog = document.getElementById('key-dialog');
    dom.keyForm = document.getElementById('key-form');
    dom.keyDialogTitle = document.getElementById('key-dialog-title');
    dom.keyDialogCopy = document.getElementById('key-dialog-copy');
    dom.editorKey = document.getElementById('editor-key');
    dom.keyError = document.getElementById('key-error');
    dom.keySubmit = document.getElementById('key-submit');
    dom.toggleEditorKey = document.getElementById('toggle-editor-key');
    dom.editorDialog = document.getElementById('editor-dialog');
    dom.editorForm = document.getElementById('editor-form');
    dom.dialogTitle = document.getElementById('dialog-title');
    dom.dialogEyebrow = document.getElementById('dialog-eyebrow');
    dom.dialogFields = document.getElementById('dialog-fields');
    dom.dialogError = document.getElementById('dialog-error');
    dom.dialogSave = document.getElementById('dialog-save');
    dom.dialogCancel = document.getElementById('dialog-cancel');
    dom.dialogClose = document.getElementById('dialog-close');
    dom.toastRegion = document.getElementById('toast-region');
  }

  function bindStaticEvents() {
    dom.appShell.addEventListener('click', handleAppAction);
    dom.contactSearch.addEventListener('input', handleContactSearch);
    dom.keyForm.addEventListener('submit', authorizeSensitiveAccess);
    dom.keyDialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      closeKeyDialog();
    });
    dom.editorForm.addEventListener('submit', saveEditor);
    dom.editorForm.addEventListener('input', function () {
      state.editorDirty = true;
      state.discardArmed = false;
      dom.dialogCancel.textContent = 'Cancelar';
      hideDialogError();
    });
    dom.editorDialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      requestCloseEditor();
    });
    window.addEventListener('beforeunload', function (event) {
      if (!state.editorDirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') loadAllData(true);
    });
  }

  function showConnectionFailure() {
    dom.loadingState.hidden = true;
    dom.connectivityBanner.textContent = 'La conexión de datos no está disponible. Revisa la configuración de Supabase.';
    dom.connectivityBanner.hidden = false;
  }

  function requestSensitiveAccess(purpose, contactId) {
    const contact = contactId ? findById(state.contacts, contactId) : null;
    const name = contact ? contact.name : 'este responsable';
    state.keyRequest = { purpose: purpose, contactId: contactId || null, token: ++state.keyRequestCounter };
    state.keyTrigger = document.activeElement;
    dom.keyDialogTitle.textContent = purpose === 'reveal'
      ? 'Ver datos de ' + name
      : 'Editar a ' + name;
    dom.keyDialogCopy.textContent = purpose === 'reveal'
      ? 'Ingresa la clave para mostrar la cédula, el teléfono, el correo y las notas.'
      : 'Ingresa la clave para editar la información sensible de este responsable.';
    dom.keyError.hidden = true;
    dom.keyError.textContent = '';
    dom.editorKey.value = '';
    dom.editorKey.type = 'password';
    dom.toggleEditorKey.textContent = 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', 'Mostrar clave');
    dom.toggleEditorKey.setAttribute('aria-pressed', 'false');
    dom.keyDialog.showModal();
    dom.editorKey.focus();
  }

  async function authorizeSensitiveAccess(event) {
    event.preventDefault();
    const request = state.keyRequest;
    const key = dom.editorKey.value;
    dom.keyError.hidden = true;
    dom.editorKey.removeAttribute('aria-invalid');
    if (!request) return;
    if (key.length < 12) {
      dom.keyError.textContent = 'La clave debe tener al menos 12 caracteres.';
      dom.keyError.hidden = false;
      dom.editorKey.setAttribute('aria-invalid', 'true');
      dom.editorKey.focus();
      return;
    }

    setBusy(dom.keySubmit, true);
    const result = await callEditorApi('responsible', { key: key, id: request.contactId });
    setBusy(dom.keySubmit, false);
    if (!state.keyRequest || state.keyRequest.token !== request.token) return;

    if (result.error) {
      dom.keyError.textContent = 'La clave no es válida. Verifícala e inténtalo nuevamente.';
      dom.keyError.hidden = false;
      dom.editorKey.setAttribute('aria-invalid', 'true');
      dom.editorKey.select();
      return;
    }

    if (request.purpose === 'reveal') {
      state.revealedContacts[request.contactId] = result.data;
      closeKeyDialog(false);
      renderContacts();
      const hideButton = dom.contactsList.querySelector('[data-action="hide-contact"][data-id="' + request.contactId + '"]');
      if (hideButton) hideButton.focus();
      toast('Datos sensibles visibles para este responsable.', 'success');
      return;
    }

    state.sensitiveEditorKey = key;
    const record = request.purpose === 'edit' ? result.data : null;
    closeKeyDialog(false);
    openEditor('contact', record);
  }

  function closeKeyDialog(restoreFocus) {
    dom.editorKey.value = '';
    dom.editorKey.type = 'password';
    dom.toggleEditorKey.textContent = 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', 'Mostrar clave');
    dom.toggleEditorKey.setAttribute('aria-pressed', 'false');
    dom.keyError.hidden = true;
    if (dom.keyDialog.open) dom.keyDialog.close();
    const trigger = state.keyTrigger;
    state.keyRequest = null;
    state.keyTrigger = null;
    if (restoreFocus !== false && trigger && typeof trigger.focus === 'function') trigger.focus();
  }

  function toggleEditorKey() {
    const revealing = dom.editorKey.type === 'password';
    dom.editorKey.type = revealing ? 'text' : 'password';
    dom.toggleEditorKey.textContent = revealing ? 'Ocultar' : 'Mostrar';
    dom.toggleEditorKey.setAttribute('aria-label', revealing ? 'Ocultar clave' : 'Mostrar clave');
    dom.toggleEditorKey.setAttribute('aria-pressed', String(revealing));
    dom.editorKey.focus();
  }

  async function loadAllData(background) {
    if (!state.client) return;
    const loadId = ++state.loadId;
    if (!background) dom.loadingState.hidden = false;
    dom.connectivityBanner.hidden = true;

    const contactsRequest = state.client.from(TABLES.contacts)
      .select('id,name,role,belongs_to,created_at,updated_at')
      .is('archived_at', null)
      .order('name');
    const results = await Promise.all([
      contactsRequest,
      state.client.from(TABLES.events).select('*').is('archived_at', null).order('event_date')
    ]);

    if (loadId !== state.loadId) return;
    const failed = results.find(function (result) { return result.error; });
    if (failed) {
      dom.loadingState.hidden = true;
      dom.connectivityBanner.hidden = false;
      return;
    }

    state.contacts = results[0].data || [];
    state.revealedContacts = {};
    state.events = results[1].data || [];
    dom.loadingState.hidden = true;
    renderAll();
    if (!background) setView(state.view);
  }

  function subscribeRealtime() {
    teardownRealtime();
    let channel = state.client.channel('coalicion-evento-publico');
    [TABLES.events].forEach(function (table) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: table }, function () {
        loadAllData(true);
      });
    });
    state.realtime = channel.subscribe();
  }

  function teardownRealtime() {
    if (state.client && state.realtime) state.client.removeChannel(state.realtime);
    state.realtime = null;
  }

  function setView(viewName) {
    state.view = viewName;
    const titles = {
      summary: 'Resumen — Evento Coalición Venezuela',
      calendar: 'Calendario — Evento Coalición Venezuela',
      contacts: 'Responsables — Evento Coalición Venezuela',
      results: 'Resultados — Evento Coalición Venezuela'
    };
    document.querySelectorAll('.tab-button').forEach(function (button) {
      if (button.dataset.view === viewName) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.view').forEach(function (view) { view.hidden = true; });
    const active = document.getElementById(viewName + '-view');
    if (active) active.hidden = false;
    document.title = titles[viewName] || titles.summary;
    if (viewName === 'calendar') renderCalendar();
    if (viewName === 'contacts') renderContacts();
    if (viewName === 'results') loadResultsIfNeeded();
  }

  function handleAppAction(event) {
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    handleAction(actionNode.dataset.action, actionNode.dataset.id);
  }

  function handleAction(action, id) {
    if (action === 'new-contact') openEditor('contact');
    if (action === 'edit-contact') requestSensitiveAccess('edit', id);
    if (action === 'reveal-contact') requestSensitiveAccess('reveal', id);
    if (action === 'hide-contact') hideContact(id);
    if (action === 'new-event') openEditor('event');
    if (action === 'edit-event') openEditor('event', findById(state.events, id));
    if (action === 'refresh-results') fetchResultados(true);
    if (action === 'filter-semaforo') toggleSemaforoFilter(id);
    if (action === 'toggle-need') toggleNeedCategory(id);
    if (action === 'select-jornada') selectJornada(id);
  }

  function hideContact(id) {
    delete state.revealedContacts[id];
    renderContacts();
    const revealButton = dom.contactsList.querySelector('[data-action="reveal-contact"][data-id="' + id + '"]');
    if (revealButton) revealButton.focus();
  }

  function renderAll() {
    renderSummary();
    renderCalendar();
    renderContacts();
    renderSummaryResults();
    renderSummaryTeam();
  }

  function renderHeaderDatetime() {
    if (!dom.headerEventDatetime) return;
    const next = nextEvent();
    dom.headerEventDatetime.textContent = next ? '📅 ' + formatDate(next.event_date) + ' · ◷ ' + formatTime(next.start_time) : '';
  }

  function renderSummary() {
    renderSummaryTeam();
    renderHeaderDatetime();
  }

  function renderSummaryResults() {
    if (!dom.summaryResults) return;
    if (!state.results.loaded || !state.results.entregas.length) {
      dom.summaryResults.hidden = true;
      return;
    }
    dom.summaryResults.hidden = false;
    const m = computeResultsMetrics(jornadaEntregas());
    const envioTotals = jornadaEnvios().reduce(function (acc, e) {
      acc.total += Number(e.totalCajas || 0);
      acc.entregado += Number(e.totalEntregado || 0);
      return acc;
    }, { total: 0, entregado: 0 });

    const tiles = [
      { icon: '📦', value: m.totalCajas, label: 'Love Boxes entregadas' },
      { icon: '👨‍👩‍👧‍👦', value: m.totalEntregas, label: 'Familias atendidas' },
      { icon: '🫶', value: m.personas, label: 'Personas beneficiadas' }
    ];
    let progressTile;
    if (envioTotals.total > 0) {
      const pct = Math.min(100, Math.round(envioTotals.entregado / envioTotals.total * 100));
      progressTile = '<div class="summary-result-tile summary-result-progress">' +
        '<span class="srt-icon">🎯</span>' +
        '<span class="srt-value">' + envioTotals.entregado + ' <small>de ' + envioTotals.total + '</small></span>' +
        '<span class="srt-label">Progreso del envío</span>' +
        '<div class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="' + envioTotals.total + '" aria-valuenow="' + envioTotals.entregado + '"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
    } else {
      progressTile = '<div class="summary-result-tile summary-result-progress">' +
        '<span class="srt-icon">🎯</span>' +
        '<span class="srt-value">—</span>' +
        '<span class="srt-label">Sin envíos registrados</span>' +
      '</div>';
    }

    renderMarkup(dom.summaryResultsGrid, tiles.map(function (t) {
      return '<div class="summary-result-tile">' +
        '<span class="srt-icon">' + t.icon + '</span>' +
        '<span class="srt-value">' + Number(t.value || 0) + '</span>' +
        '<span class="srt-label">' + safe(t.label) + '</span>' +
      '</div>';
    }).join('') + progressTile);
  }

  // Orden fijo de la franja de colaboradores en el Resumen (ADRA al extremo derecho).
  const COLLABORATOR_STRIP_ORDER = [
    'Coalicion con amor a Venezuela',
    'Fundacion Ingenia',
    'Nodos Venezuela',
    'conektados',
    'ADRA'
  ];

  function renderSummaryTeam() {
    if (!dom.summaryTeamList) return;
    const orgCards = Object.keys(AFFILIATION_LOGOS).map(function (org) {
      return { key: org, cls: affiliationClass(org), logo: AFFILIATION_LOGOS[org], alt: org };
    });
    const fixedCards = FIXED_COLLABORATOR_LOGOS.map(function (c) {
      return { key: c.key, cls: 'affiliation-' + c.key, logo: c.logo, alt: c.alt };
    });
    const byKey = {};
    orgCards.concat(fixedCards).forEach(function (c) { byKey[c.key] = c; });
    const cards = COLLABORATOR_STRIP_ORDER.map(function (key) { return byKey[key]; }).filter(Boolean);
    renderMarkup(dom.summaryTeamList, cards.map(function (c) {
      return '<div class="collaborator-card ' + safe(c.cls) + '">' +
        '<img src="' + safe(c.logo) + '" alt="' + safe(c.alt) + '">' +
      '</div>';
    }).join(''));
  }

  function renderCalendar() {
    const parts = state.calendarMonth.split('-').map(Number);
    const year = parts[0];
    const monthIndex = parts[1] - 1;
    dom.calendarMonthLabel.textContent = MONTHS[monthIndex] + ' ' + year;
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const mondayOffset = (first.getUTCDay() + 6) % 7;
    const today = new Date().toISOString().slice(0, 10);
    let markup = WEEKDAYS.map(function (day) { return '<div class="calendar-weekday">' + day + '</div>'; }).join('');
    for (let blank = 0; blank < mondayOffset; blank += 1) markup += '<div class="calendar-day is-blank" aria-hidden="true"></div>';
    for (let day = 1; day <= lastDay; day += 1) {
      const iso = year + '-' + String(monthIndex + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const dayEvents = state.events.filter(function (item) { return item.event_date === iso; });
      markup += '<div class="calendar-day' + (iso === today ? ' is-today' : '') + '">' +
        '<span class="calendar-number">' + day + '</span>' +
        dayEvents.map(function (item) {
          return '<button class="calendar-event" type="button" data-action="edit-event" data-id="' + safe(item.id) + '">' + safe(formatTime(item.start_time) + ' · ' + item.title) + '</button>';
        }).join('') + '</div>';
    }
    renderMarkup(dom.calendarGrid, markup);
  }

  function renderContacts() {
    const query = normalize(state.query);
    const contacts = state.contacts.filter(function (contact) {
      return !query || normalize([contact.name, contact.role, contact.belongs_to].join(' ')).includes(query);
    });
    dom.contactResultCount.textContent = contacts.length + ' de ' + state.contacts.length + ' responsables';
    dom.contactSearchClear.hidden = !state.query;
    if (!contacts.length) {
      renderMarkup(dom.contactsList, emptyState(state.contacts.length ? '🔎 Sin coincidencias' : '🤝 Directorio vacío', state.contacts.length ? 'Prueba otra búsqueda o limpia el filtro.' : 'Agrega los responsables autorizados del evento.', state.contacts.length ? '<button class="btn btn-secondary" type="button" id="empty-clear-search">Limpiar búsqueda</button>' : ''));
      const clear = document.getElementById('empty-clear-search');
      if (clear) clear.addEventListener('click', clearContactSearch);
      return;
    }
    renderMarkup(dom.contactsList, contacts.map(function (contact) {
      const fullContact = state.revealedContacts[contact.id];
      return '<article class="contact-card ' + safe(affiliationClass(contact.belongs_to)) + '">' +
        '<div class="contact-card-header"><div class="contact-avatar" aria-hidden="true">' + safe(initials(contact.name)) + '</div><div><h3>' + safe(contact.name) + '</h3><div class="contact-role">' + safe(contact.role || 'Responsable') + '</div></div></div>' +
        '<div class="contact-chips"><span class="affiliation-chip">🏷️ ' + safe(contact.belongs_to || 'Pertenencia por confirmar') + '</span><span class="private-chip">🔐 Datos sensibles protegidos</span></div>' +
        renderSensitiveDetails(fullContact) +
        '<div class="contact-card-actions">' +
          '<button class="btn btn-ghost privacy-eye" type="button" data-action="' + (fullContact ? 'hide-contact' : 'reveal-contact') + '" data-id="' + safe(contact.id) + '" aria-label="' + (fullContact ? 'Ocultar' : 'Ver') + ' datos sensibles de ' + safe(contact.name) + '">' + (fullContact ? '🙈 Ocultar datos' : '👁️ Ver datos') + '</button>' +
          '<button class="btn btn-secondary" type="button" data-action="edit-contact" data-id="' + safe(contact.id) + '">Editar responsable</button>' +
        '</div>' +
      '</article>';
    }).join(''));
  }

  function renderSensitiveDetails(contact) {
    if (!contact) {
      return '<div class="contact-details" aria-label="Datos sensibles ocultos">' +
        sensitiveRow('▣ Cédula', '<span class="masked-value" aria-label="Oculto">••••••••</span>') +
        sensitiveRow('◉ Teléfono', '<span class="masked-value" aria-label="Oculto">•••• ••••</span>') +
        sensitiveRow('✉ Correo', '<span class="masked-value" aria-label="Oculto">••••••@••••.•••</span>') +
        sensitiveRow('↳ Notas', '<span class="masked-value" aria-label="Oculto">••••••••••</span>') +
      '</div>';
    }
    const phone = contact.phone
      ? '<a href="tel:' + safe(contact.phone) + '">' + safe(contact.phone) + '</a>'
      : 'Por confirmar';
    const email = contact.email
      ? '<a href="mailto:' + safe(contact.email) + '">' + safe(contact.email) + '</a>'
      : 'Por confirmar';
    return '<div class="contact-details">' +
      sensitiveRow('▣ Cédula', '<strong>' + safe(contact.national_id || 'Por confirmar') + '</strong>') +
      sensitiveRow('◉ Teléfono', phone) +
      sensitiveRow('✉ Correo', email) +
      sensitiveRow('↳ Notas', safe(contact.notes || 'Por confirmar')) +
    '</div>';
  }

  function sensitiveRow(label, value) {
    return '<div class="sensitive-row"><span class="sensitive-label">' + safe(label) + '</span><span class="sensitive-value">' + value + '</span></div>';
  }

  // ---------- Resultados de la jornada (conektados Lite) ----------

  function loadResultsIfNeeded() {
    if (state.results.loaded || state.results.loading) {
      if (state.results.loaded) renderResultados();
      return;
    }
    fetchResultados(false);
  }

  async function callLiteApi(resource, params) {
    if (USE_STATIC_DEMO_DATA) {
      if (resource === 'entregas') return { data: { total: STATIC_DEMO_ENTREGAS.length, entregas: STATIC_DEMO_ENTREGAS }, error: null };
      if (resource === 'envios') return { data: { total: STATIC_DEMO_ENVIOS.length, envios: STATIC_DEMO_ENVIOS }, error: null };
      return { data: { total: 0 }, error: null };
    }
    try {
      const response = await fetch(LITE_FUNCTION_URL, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: resource, params: params || {} })
      });
      const body = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        return { data: null, error: { status: response.status, message: body.error || 'operation unavailable' } };
      }
      return { data: body.data, error: null };
    } catch (_error) {
      return { data: null, error: { status: 0, message: 'network unavailable' } };
    }
  }

  // Cada jornada es un envío real de conektados Lite (envioId) — NO agrupamos
  // por fechaRecibimiento, porque algunas entregas de una misma jornada se
  // anotaron a mano con una fecha distinta a la del envío (error de captura
  // en campo). Agrupar por envío evita partir una sola jornada en varias.
  function jornadaList() {
    const counts = {};
    const meta = {};
    state.results.entregas.forEach(function (e) {
      const key = e.envioId != null ? String(e.envioId) : 'sin-envio';
      counts[key] = (counts[key] || 0) + 1;
      if (!meta[key]) meta[key] = { codigo: e.envio && e.envio.codigo, fecha: e.envio && e.envio.fecha };
    });
    return Object.keys(counts).map(function (k) {
      return { id: k, count: counts[k], fecha: meta[k].fecha, codigo: meta[k].codigo };
    }).sort(function (a, b) { return (b.fecha || '') < (a.fecha || '') ? -1 : (b.fecha || '') > (a.fecha || '') ? 1 : 0; });
  }

  function jornadaEntregas() {
    const id = state.results.selectedJornada;
    if (!id) return state.results.entregas;
    return state.results.entregas.filter(function (e) { return (e.envioId != null ? String(e.envioId) : 'sin-envio') === id; });
  }

  function jornadaEnvios() {
    const id = state.results.selectedJornada;
    if (!id) return state.results.envios;
    return state.results.envios.filter(function (e) { return String(e.id) === id; });
  }

  function ensureSelectedJornada() {
    const list = jornadaList();
    if (!list.length) { state.results.selectedJornada = null; return; }

    // Preferimos anclar siempre al envío cuya fecha coincide con el evento
    // activo del calendario (no "el que tenga más entregas") — así el número
    // mostrado no salta solo porque una jornada en curso va acumulando
    // entregas en vivo. Reintentamos esto en cada carga hasta lograrlo; una
    // vez anclado, queda fijo el resto de la sesión.
    // No anclamos todavía a una jornada nueva que apenas tiene unas pocas
    // entregas capturadas (ej. un envío recién creado hoy) — eso hacía que
    // el dashboard saltara de mostrar una jornada consolidada de cientos de
    // entregas a mostrar un envío casi vacío, sin avisar. Umbral temporal
    // mientras se decide el comportamiento definitivo (ver selector de
    // "Total / todas las jornadas" pendiente).
    const JORNADA_MIN_ENTREGAS_PARA_ANCLAR = 10;
    if (!state.results.jornadaAnchored) {
      const next = nextEvent();
      if (next) {
        const match = list.find(function (j) { return j.fecha === next.event_date; });
        if (match && match.count >= JORNADA_MIN_ENTREGAS_PARA_ANCLAR) {
          state.results.selectedJornada = match.id;
          state.results.jornadaAnchored = true;
          return;
        }
      }
    }

    const stillValid = list.some(function (j) { return j.id === state.results.selectedJornada; });
    if (stillValid) return;
    // Reserva mientras no se pueda anclar todavía: el envío con más
    // entregas registradas.
    const best = list.slice().sort(function (a, b) { return b.count - a.count; })[0];
    state.results.selectedJornada = best.id;
  }

  function selectJornada(id) {
    if (!id || id === state.results.selectedJornada) return;
    state.results.selectedJornada = id;
    state.results.jornadaAnchored = true;
    renderResultados();
    renderSummaryResults();
  }

  function renderJornadaPicker() {
    if (!dom.resultsJornadaPicker) return;
    const list = jornadaList();
    if (list.length <= 1) { dom.resultsJornadaPicker.hidden = true; return; }
    dom.resultsJornadaPicker.hidden = false;
    renderMarkup(dom.resultsJornadaSelect, list.map(function (j) {
      const selected = j.id === state.results.selectedJornada ? ' selected' : '';
      const label = (j.fecha ? formatDate(j.fecha) : 'Sin fecha') + (j.codigo ? ' · ' + j.codigo : '');
      return '<option value="' + safe(j.id) + '"' + selected + '>' + safe(label) + ' · ' + j.count + ' entregas</option>';
    }).join(''));
  }

  async function fetchResultados(userTriggered) {
    state.results.loading = true;
    state.results.error = null;
    if (userTriggered || !state.results.loaded) {
      dom.resultsStatus.hidden = false;
      dom.resultsStatus.className = 'notice notice-warning page-notice';
      dom.resultsStatus.textContent = 'Cargando resultados de conektados Lite…';
      dom.resultsBody.hidden = true;
      dom.resultsEmpty.hidden = true;
    }
    const [result, enviosResult] = await Promise.all([
      callLiteApi('entregas', {}),
      callLiteApi('envios', {})
    ]);
    state.results.loading = false;
    if (result.error) {
      state.results.error = result.error;
      dom.resultsStatus.hidden = false;
      dom.resultsStatus.className = 'notice notice-error page-notice';
      dom.resultsStatus.textContent = result.error.status === 401
        ? 'La conexión con conektados Lite todavía no está configurada (falta el token o el dominio).'
        : 'No pudimos traer los resultados de conektados Lite. ' + (result.error.message || '') + ' — intenta actualizar en un momento.';
      dom.resultsBody.hidden = true;
      renderSummaryResults();
      return;
    }
    state.results.loaded = true;
    state.results.entregas = (result.data && result.data.entregas) || [];
    state.results.envios = (enviosResult.data && enviosResult.data.envios) || [];
    ensureSelectedJornada();
    dom.resultsStatus.hidden = true;
    renderResultados();
    renderSummaryResults();
  }

  function toggleSemaforoFilter(colorKey) {
    state.results.semaforoFilter = state.results.semaforoFilter === colorKey ? null : colorKey;
    renderResultados();
  }

  function normalizeZoneName(raw) {
    const text = String(raw || '').trim();
    if (!text) return 'Sin especificar';
    const stripped = text.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^(barrio|sector|urbanizacion|urb\.?|calle|avenida|av\.?|zona)\s+/i, '')
      .replace(/\s+/g, ' ').trim();
    return stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : text;
  }

  // conektados Lite no manda coordenadas (ubicacionActual es texto libre, no
  // un punto de mapa) — esta es una geocodificación manual de las zonas con
  // más entregas, hecha una sola vez, para que el mapa de "Ubicación actual"
  // tenga puntos reales mientras no haya coordenadas en la API. Se puede
  // ampliar agregando más entradas con el mismo nombre normalizado como key.
  const STATIC_ZONE_COORDS = {
    'Mare, catia la mar, parroquia urimare, municipio vargas, estado vargas, 1162, venezuela': [10.6066515, -66.9797755],
    'Bicentenaria, mare, catia la mar, parroquia urimare, municipio vargas, estado vargas, 1162, venezuela': [10.6031093, -66.9652971],
    'Brisas del aeropuerto, catia la mar, parroquia urimare, municipio vargas, estado vargas, 1162, venezuela': [10.5927141, -67.0043153],
    'Valle la cruz, ezequiel zamora, parroquia catia la mar, municipio vargas, estado vargas, 1162, venezuela': [10.5786833, -67.0157808],
    'Catia la mar, parroquia urimare, municipio vargas, estado vargas, 1162, venezuela': [10.5992669, -67.0145106],
    'Aeropuerto la guaira': [10.5974618, -67.0049753],
    'El aeropuerto la guaira': [10.6001010, -66.9818693],
    'Aeropuerto maiquetia la guaira': [10.6031377, -66.9966802],
    'Maiquetia, parroquia maiquetia, municipio vargas, estado vargas, 1161, venezuela': [10.6031377, -66.9966802],
    'Unidad educativa jose atanasio girardot, calle 4, playa grande, catia la mar, parroquia urimare, municipio vargas, estado vargas, 1162, venezuela': [10.6088372, -67.0159933],
    'Caracas, parroquia sucre, municipio libertador, distrito metropolitano de caracas, distrito capital, venezuela': [10.4937486, -66.8841058],
    'El piache, terrazas de alto picure, parroquia catia la mar, municipio vargas, estado vargas, 1162, venezuela': [10.5764140, -67.0510237],
    'El piache, parroquia catia la mar, municipio vargas, estado vargas, 1162, venezuela': [10.5764140, -67.0510237],
    'Carlos soublette': [10.5989798, -66.9741680],
    'La soublette, catia la mar': [10.5977383, -67.0393882],
    'El plan la guaira': [10.5321704, -66.9709678],
    'La guaira c': [10.6000384, -66.9296405],
    'Atanasio girardot la guaira': [10.6090029, -67.0166967],
    'Carayaca, parroquia carayaca, municipio vargas, estado vargas, 1167, venezuela': [10.5293542, -67.1204381],
    'Carallaca la guaira': [10.5293542, -67.1204381]
  };

  function computeResultsMetrics(entregas) {
    const totalCajas = entregas.reduce(function (sum, e) { return sum + Number(e.cantidadPaquetes || 0); }, 0);
    const totalAdultos = entregas.reduce(function (sum, e) { return sum + Number(e.composicionAdultos || 0); }, 0);
    const totalNinos = entregas.reduce(function (sum, e) { return sum + Number(e.composicionNinos || 0); }, 0);
    const confirmadas = entregas.filter(function (e) { return e.confirmadoRecibido === true; }).length;
    const pendientes = entregas.filter(function (e) { return e.confirmadoRecibido === null || e.confirmadoRecibido === undefined; }).length;

    const semaforo = { Verde: 0, Amarillo: 0, Rojo: 0, Colapso: 0 };
    entregas.forEach(function (e) {
      const status = classifySemaforo(e.statusVivienda);
      if (status) semaforo[status] += 1;
    });

    const zoneMap = {};
    entregas.forEach(function (e) {
      const zone = normalizeZoneName(e.ubicacionActual);
      if (!zoneMap[zone]) zoneMap[zone] = { name: zone, count: 0, lat: null, lng: null, semaforo: { Verde: 0, Amarillo: 0, Rojo: 0, Colapso: 0 } };
      zoneMap[zone].count += 1;
      const status = classifySemaforo(e.statusVivienda);
      if (status) zoneMap[zone].semaforo[status] += 1;
      if (zoneMap[zone].lat == null && typeof e.ubicacionLat === 'number') { zoneMap[zone].lat = e.ubicacionLat; zoneMap[zone].lng = e.ubicacionLng; }
      if (zoneMap[zone].lat == null && STATIC_ZONE_COORDS[zone]) { zoneMap[zone].lat = STATIC_ZONE_COORDS[zone][0]; zoneMap[zone].lng = STATIC_ZONE_COORDS[zone][1]; }
    });
    // "Sin especificar" sí cuenta en el listado (es información real: cuántas
    // personas no dieron dirección), pero nunca tiene coordenadas, así que el
    // mapa (que solo dibuja entradas con lat/lng numéricos) ya la excluye solo.
    const zones = Object.keys(zoneMap).map(function (k) { return zoneMap[k]; }).sort(function (a, b) { return b.count - a.count; });

    const needCategoryMap = {};
    entregas.forEach(function (e) {
      // necesidad es una lista (una persona puede pedir varias cosas a la
      // vez); cada una suma en su propio bucket. Se acepta también un string
      // suelto por compatibilidad con datos antiguos, igual que statusVivienda.
      const rawNeeds = Array.isArray(e.necesidad) ? e.necesidad : (e.necesidad ? [e.necesidad] : []);
      if (!rawNeeds.length) rawNeeds.push('Sin especificar');
      rawNeeds.forEach(function (need) {
        const category = classifyNeed(need);
        if (!needCategoryMap[category.key]) needCategoryMap[category.key] = { key: category.key, icon: category.icon, label: category.label, count: 0, items: {} };
        needCategoryMap[category.key].count += 1;
        needCategoryMap[category.key].items[need] = (needCategoryMap[category.key].items[need] || 0) + 1;
      });
    });
    const needs = Object.keys(needCategoryMap).map(function (k) {
      const bucket = needCategoryMap[k];
      const items = Object.keys(bucket.items).map(function (name) { return { name: name, count: bucket.items[name] }; }).sort(function (a, b) { return b.count - a.count; });
      return { key: bucket.key, icon: bucket.icon, label: bucket.label, count: bucket.count, items: items };
    }).sort(function (a, b) { return b.count - a.count; });

    const nucleos = NUCLEO_BRACKETS.map(function (bracket) {
      const matching = entregas.filter(function (e) {
        const total = Number(e.composicionAdultos || 0) + Number(e.composicionNinos || 0);
        return bracket.test(total);
      });
      const cajas = matching.reduce(function (sum, e) { return sum + Number(e.cantidadPaquetes || 0); }, 0);
      return { key: bracket.key, label: bracket.label, count: matching.length, cajas: cajas, avgCajas: matching.length ? (cajas / matching.length) : 0 };
    });

    return {
      totalEntregas: entregas.length, totalCajas: totalCajas,
      totalAdultos: totalAdultos, totalNinos: totalNinos, personas: totalAdultos + totalNinos,
      confirmadas: confirmadas, pendientes: pendientes, semaforo: semaforo, zones: zones, needs: needs, nucleos: nucleos
    };
  }

  function renderResultados() {
    renderJornadaPicker();
    const filter = state.results.semaforoFilter;
    const all = jornadaEntregas();
    const filtered = filter
      ? all.filter(function (e) { const s = Array.isArray(e.statusVivienda) ? e.statusVivienda[0] : e.statusVivienda; return s === filter; })
      : all;

    if (!all.length) {
      dom.resultsBody.hidden = true;
      dom.resultsEmpty.hidden = false;
      renderMarkup(dom.resultsEmpty, emptyState('📦 Aún no hay entregas registradas', 'En cuanto el equipo empiece a registrar en conektados Lite, esta pantalla se llena sola.', ''));
      return;
    }
    dom.resultsEmpty.hidden = true;
    dom.resultsBody.hidden = false;

    const m = computeResultsMetrics(filtered);

    renderMarkup(dom.resultsKpiGrid,
      kpi('kpi-primary', m.totalCajas, '📦 Cajas entregadas') +
      kpi('kpi-blue', m.totalEntregas, '🫂 Entregas registradas') +
      kpi('kpi-sky', m.personas, '👥 Personas beneficiadas') +
      kpi('kpi-indigo', m.confirmadas, '✅ Confirmadas por QR')
    );

    const overall = filter ? computeResultsMetrics(all) : m;
    renderSemaforoBlock(overall.semaforo, all.length);
    renderZonesBlock(m.zones);
    state.results.needsData = m.needs;
    state.results.needsTotal = m.totalEntregas;
    renderNeedsBlock(m.needs, m.totalEntregas);
    renderNucleosBlock(m.nucleos);
    // Insights y recomendaciones narran la jornada completa, no el recorte del
    // filtro rápido del semáforo — si no, "42% en Rojo" desaparecería en cuanto
    // alguien filtre a "solo Verde" y el mensaje dejaría de tener sentido.
    const insights = computeInsights(overall);
    renderInsightsBlock(insights);
    renderRecommendationsBlock(computeRecommendations(overall));
  }

  function renderSemaforoBlock(semaforo) {
    const total = semaforo.Verde + semaforo.Amarillo + semaforo.Rojo + semaforo.Colapso;
    const filter = state.results.semaforoFilter;
    renderMarkup(dom.resultsSemaforo, SEMAFORO_KEYS.map(function (key) {
      const meta = SEMAFORO_META[key];
      const count = semaforo[key];
      const pct = total ? Math.round(count / total * 100) : 0;
      const active = !filter || filter === key;
      return '<button type="button" class="semaforo-chip' + (active ? ' active' : '') + '" data-action="filter-semaforo" data-id="' + key + '" style="--chip-color:' + meta.color + ';--chip-soft:' + meta.soft + '">' +
        '<span class="semaforo-chip-top"><span class="semaforo-dot"></span><span class="semaforo-num">' + pct + '%</span><span class="semaforo-pct">' + count + '</span></span>' +
        '<span class="semaforo-label">' + meta.label + '</span>' +
      '</button>';
    }).join(''));

    renderMarkup(dom.resultsSemaforoBar, SEMAFORO_KEYS.map(function (key) {
      const meta = SEMAFORO_META[key];
      const pct = total ? (semaforo[key] / total * 100) : 0;
      return '<span style="width:' + pct + '%;background:' + meta.color + '"></span>';
    }).join(''));

    if (filter) {
      dom.resultsFilterPill.hidden = false;
      renderMarkup(dom.resultsFilterPill, '🔎 Mostrando solo <strong>' + SEMAFORO_META[filter].label + '</strong> · <button type="button" data-action="filter-semaforo" data-id="' + filter + '">ver todas</button>');
    } else {
      dom.resultsFilterPill.hidden = true;
    }
  }

  function renderZonesBlock(zones) {
    if (!zones.length) {
      renderMarkup(dom.resultsZoneList, emptyState('📍 Sin ubicaciones', 'Las entregas todavía no traen ubicación.', ''));
      dom.resultsMap.innerHTML = '';
      return;
    }
    const maxCount = zones[0].count;
    renderMarkup(dom.resultsZoneList, zones.slice(0, 10).map(function (z) {
      const pct = maxCount ? Math.round(z.count / maxCount * 100) : 0;
      return '<div class="zone-row"><span class="zone-name">' + safe(z.name) + '</span><span class="zone-count">' + z.count + '</span>' +
        '<span class="zone-track"><span class="zone-fill" style="width:' + pct + '%"></span></span></div>';
    }).join(''));

    renderResultsMap(zones);
  }

  function renderResultsMap(zones) {
    if (!window.L || !dom.resultsMap) return;
    const withCoords = zones.filter(function (z) {
      return typeof z.lat === 'number' && typeof z.lng === 'number' &&
        z.lat > 0 && z.lat < 13 && z.lng > -75 && z.lng < -59;
    });
    if (!state.map) {
      state.map = window.L.map(dom.resultsMap, { attributionControl: true, zoomControl: true, scrollWheelZoom: false });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap'
      }).addTo(state.map);
      state.mapMarkers = window.L.layerGroup().addTo(state.map);
    }
    state.map.invalidateSize();
    state.mapMarkers.clearLayers();
    if (!withCoords.length) {
      state.map.setView([10.5, -66.9], 9);
      return;
    }
    const SEMAFORO_HEX = { Verde: '#0f7a3d', Amarillo: '#d69e00', Rojo: '#a02525', Colapso: '#1c1c1c' };
    const bounds = [];
    // El grueso de las entregas cae en esta caja (Vargas / Catia La Mar); unos pocos puntos
    // sueltos y con datos errados quedan muy lejos y arruinarían el zoom si los usamos para encuadrar.
    const CORE_BOX = { latMin: 10.4, latMax: 10.75, lngMin: -67.15, lngMax: -66.6 };
    const coreBounds = [];
    withCoords.forEach(function (z) {
      const dominant = SEMAFORO_KEYS.reduce(function (best, key) { return z.semaforo[key] > z.semaforo[best] ? key : best; }, 'Verde');
      const color = SEMAFORO_HEX[dominant] || '#1d4ed8';
      const marker = window.L.circleMarker([z.lat, z.lng], { radius: Math.min(20, 6 + z.count), color: '#fff', weight: 2, fillColor: color, fillOpacity: .85 });
      marker.bindTooltip(safe(z.name) + ' · ' + z.count);
      marker.addTo(state.mapMarkers);
      bounds.push([z.lat, z.lng]);
      if (z.lat >= CORE_BOX.latMin && z.lat <= CORE_BOX.latMax && z.lng >= CORE_BOX.lngMin && z.lng <= CORE_BOX.lngMax) {
        coreBounds.push([z.lat, z.lng]);
      }
    });
    state.map.fitBounds(coreBounds.length ? coreBounds : bounds, { padding: [30, 30], maxZoom: 15 });
    setTimeout(function () { if (state.map) state.map.invalidateSize(); }, 60);
  }

  function renderNeedsBlock(needs, total) {
    if (!needs.length) {
      renderMarkup(dom.resultsNeeds, emptyState('🥫 Sin necesidades registradas', '', ''));
      return;
    }
    // Porcentaje = de cuántas entregas de esta jornada se reportó cada
    // necesidad (una persona puede pedir varias, así que la suma de los
    // porcentajes puede superar 100%; cada barra es independiente).
    const base = total || needs.reduce(function (sum, n) { return sum + n.count; }, 0);
    const maxPct = needs.reduce(function (max, n) { return Math.max(max, base ? n.count / base * 100 : 0); }, 0) || 1;
    const openKey = state.results.openNeedCategory;
    renderMarkup(dom.resultsNeeds,
      '<div class="need-bar-list">' + needs.map(function (n) {
        const pct = base ? Math.round(n.count / base * 100) : 0;
        const barWidth = Math.round((base ? n.count / base * 100 : 0) / maxPct * 100);
        const isOpen = openKey === n.key;
        const row = '<button type="button" class="need-bar-row' + (isOpen ? ' open' : '') + '" data-action="toggle-need" data-id="' + safe(n.key) + '">' +
          '<span class="need-bar-label">' + n.icon + ' ' + safe(n.label) + '</span>' +
          '<span class="need-bar-track"><span class="need-bar-fill" style="width:' + barWidth + '%"></span></span>' +
          '<span class="need-bar-pct">' + pct + '%</span>' +
          '<span class="need-bar-count">' + n.count + '</span>' +
        '</button>';
        if (!isOpen) return row;
        return row + '<div class="need-detail">' +
          n.items.map(function (it) {
            return '<div class="need-detail-row"><span>' + safe(it.name) + '</span><span>' + it.count + '</span></div>';
          }).join('') +
        '</div>';
      }).join('') + '</div>'
    );
  }

  function toggleNeedCategory(key) {
    state.results.openNeedCategory = state.results.openNeedCategory === key ? null : key;
    renderNeedsBlock(state.results.needsData || [], state.results.needsTotal || 0);
  }

  function renderNucleosBlock(nucleos) {
    renderMarkup(dom.resultsNucleos, nucleos.map(function (n) {
      return '<div class="nucleo-card"><strong>' + n.count + '</strong><span>' + safe(n.label) + '</span>' +
        '<div class="nucleo-meta">' + n.cajas + ' cajas · ' + n.avgCajas.toFixed(1) + ' prom.</div></div>';
    }).join(''));
  }

  // ---------- Insights y recomendaciones ----------
  // Ambos se calculan en vivo a partir de las mismas métricas ya mostradas
  // arriba (semáforo, necesidades, zonas, confirmaciones, núcleos) — nada de
  // texto inventado, cada frase es verificable contra los números de la
  // jornada. Las recomendaciones solo aparecen cuando el dato cruza un umbral
  // que amerita acción; si nada lo amerita, se muestra un mensaje neutral.

  function computeInsights(m) {
    const insights = [];
    const total = m.totalEntregas;
    if (!total) return insights;

    // Núcleo familiar: cuántos niños hay y qué tan grande suele ser la familia.
    const personasTotal = m.personas;
    if (personasTotal) {
      const pctNinos = Math.round(m.totalNinos / personasTotal * 100);
      insights.push({
        icon: '🧒', tone: pctNinos >= 40 ? 'warning' : 'neutral',
        html: '<strong>' + m.totalNinos + ' niños</strong> (' + pctNinos + '%) forman parte de las ' + personasTotal + ' personas beneficiadas, junto a ' + m.totalAdultos + ' adultos.'
      });
    }

    const topNucleo = m.nucleos.slice().sort(function (a, b) { return b.count - a.count; })[0];
    if (topNucleo && topNucleo.count) {
      const pctN = Math.round(topNucleo.count / total * 100);
      insights.push({
        icon: '👨‍👩‍👧‍👦', tone: 'neutral',
        html: 'El núcleo familiar más común es de <strong>' + safe(topNucleo.label) + '</strong>: ' + topNucleo.count + ' familias (' + pctN + '%).'
      });
    }

    // Necesidades: la principal y la segunda, para no quedarse con una sola lectura.
    if (m.needs.length) {
      const n0 = m.needs[0];
      const pct0 = Math.round(n0.count / total * 100);
      insights.push({
        icon: n0.icon, tone: 'neutral',
        html: '<strong>' + safe(n0.label) + '</strong> es la necesidad más reportada: ' + pct0 + '% de las entregas (' + n0.count + ').'
      });
    }
    if (m.needs.length > 1) {
      const n1 = m.needs[1];
      const pct1 = Math.round(n1.count / total * 100);
      insights.push({
        icon: n1.icon, tone: 'neutral',
        html: 'La segunda necesidad más reportada es <strong>' + safe(n1.label) + '</strong>: ' + pct1 + '% de las entregas (' + n1.count + ').'
      });
    }

    // Semáforo: riesgo alto (Rojo/Colapso) y riesgo moderado pero reparable (Amarillo).
    const riesgo = m.semaforo.Rojo + m.semaforo.Colapso;
    const riesgoPct = Math.round(riesgo / total * 100);
    insights.push({
      icon: '🚦', tone: riesgoPct >= 40 ? 'danger' : riesgoPct >= 20 ? 'warning' : 'good',
      html: '<strong>' + riesgoPct + '%</strong> de las viviendas registradas están en Rojo o Colapso (' + riesgo + ' de ' + total + ').'
    });
    const amarilloPct = Math.round(m.semaforo.Amarillo / total * 100);
    insights.push({
      icon: '🟡', tone: amarilloPct >= 30 ? 'warning' : 'neutral',
      html: '<strong>' + amarilloPct + '%</strong> de las viviendas están en Amarillo — riesgo moderado que todavía se puede reparar (' + m.semaforo.Amarillo + ').'
    });

    return insights;
  }

  function computeRecommendations(m) {
    const recs = [];
    const total = m.totalEntregas;
    if (!total) return recs;

    const riesgo = m.semaforo.Rojo + m.semaforo.Colapso;
    const riesgoPct = Math.round(riesgo / total * 100);
    if (riesgoPct >= 30) {
      recs.push({ icon: '🏚️', html: 'Priorizar inspección y refuerzo estructural en las <strong>' + riesgo + ' viviendas</strong> en Rojo o Colapso antes de la próxima jornada.' });
    } else if (riesgoPct >= 15) {
      recs.push({ icon: '🏚️', html: 'Mantener seguimiento cercano a las <strong>' + riesgo + ' viviendas</strong> en Rojo o Colapso.' });
    }

    const amarilloPct = Math.round(m.semaforo.Amarillo / total * 100);
    if (amarilloPct >= 25) {
      recs.push({ icon: '🟡', html: 'Programar reparaciones preventivas en las <strong>' + m.semaforo.Amarillo + ' viviendas</strong> en Amarillo antes de que su condición empeore.' });
    }

    if (m.needs.length) {
      const n0 = m.needs[0];
      const pct0 = Math.round(n0.count / total * 100);
      if (pct0 >= 30) {
        recs.push({ icon: n0.icon, html: 'Reforzar el abastecimiento de <strong>' + safe(n0.label) + '</strong> en la próxima jornada — es la necesidad más solicitada (' + pct0 + '%).' });
      }
    }

    const personasTotal = m.personas;
    if (personasTotal) {
      const pctNinos = Math.round(m.totalNinos / personasTotal * 100);
      if (pctNinos >= 30) {
        recs.push({ icon: '🧒', html: 'Priorizar artículos y atención para niños en la próxima jornada — representan <strong>' + pctNinos + '%</strong> de las personas beneficiadas (' + m.totalNinos + ').' });
      }
    }

    if (!recs.length) {
      recs.push({ icon: '👍', html: 'No hay alertas críticas en esta jornada según los datos registrados — mantener el ritmo actual.' });
    }

    return recs;
  }

  function renderInsightsBlock(insights) {
    if (!insights.length) {
      renderMarkup(dom.resultsInsights, emptyState('💡 Sin datos suficientes', 'Todavía no hay entregas registradas para esta jornada.', ''));
      return;
    }
    renderMarkup(dom.resultsInsights, insights.map(function (it) {
      return '<div class="insight-item tone-' + it.tone + '"><span class="insight-icon">' + it.icon + '</span><span>' + it.html + '</span></div>';
    }).join(''));
  }

  function renderRecommendationsBlock(recs) {
    renderMarkup(dom.resultsRecommendations, recs.map(function (r) {
      return '<div class="recommendation-item"><span class="recommendation-icon">' + r.icon + '</span><span>' + r.html + '</span></div>';
    }).join(''));
  }

  function openEditor(type, record) {
    state.editor = { type: type, record: record || null };
    state.editorDirty = false;
    state.discardArmed = false;
    dom.dialogCancel.textContent = 'Cancelar';
    hideDialogError();
    const configs = {
      contact: { eyebrow: 'Equipo del evento', title: record ? 'Editar responsable' : 'Agregar responsable', fields: contactFields(record) },
      event: { eyebrow: 'Agenda compartida', title: record ? 'Editar evento' : 'Agregar evento', fields: eventFields(record) }
    };
    const config = configs[type];
    dom.dialogEyebrow.textContent = config.eyebrow;
    dom.dialogTitle.textContent = config.title;
    renderMarkup(dom.dialogFields, config.fields);
    dom.editorDialog.showModal();
    const first = dom.dialogFields.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  function contactFields(record) {
    const item = record || {};
    return field('Nombre completo', 'name', item.name, 'text', true) +
      field('Rol en el evento', 'role', item.role || 'Responsable', 'text', true) +
      selectField('Pertenece a:', 'belongs_to', item.belongs_to || '', AFFILIATIONS, 'field-full') +
      field('Cédula', 'national_id', item.national_id, 'text', false, 'numeric') +
      field('Teléfono', 'phone', item.phone, 'tel', true, 'tel') +
      field('Correo electrónico', 'email', item.email, 'email', false, 'email') +
      textareaField('Notas operativas', 'notes', item.notes, 'field-full');
  }

  function eventFields(record) {
    const item = record || {};
    return field('Nombre del evento', 'title', item.title, 'text', true, '', 'field-full') +
      field('Fecha', 'event_date', item.event_date || new Date().toISOString().slice(0, 10), 'date', true) +
      field('Hora de inicio', 'start_time', timeInput(item.start_time), 'time', false) +
      field('📍 Dirección (opcional si agregas Maps)', 'location', item.location, 'text', false, '', 'field-full', 'Ej.: Calle Real de Mare Abajo, frente al bulevar', 'Puedes dejarla vacía si pegas el enlace de Google Maps.') +
      field('🗺️ Enlace de Google Maps (opcional si agregas dirección)', 'maps_url', item.maps_url, 'url', false, 'url', 'field-full', 'Pega el enlace del punto exacto', 'Debes completar la dirección o este enlace. Acepta maps.google.com y maps.app.goo.gl.') +
      selectField('Estado', 'status', item.status || 'planned', EVENT_STATUS) +
      textareaField('Indicaciones y notas', 'notes', item.notes, 'field-full');
  }

  async function saveEditor(event) {
    event.preventDefault();
    if (!state.editor) return;
    hideDialogError();
    const data = Object.fromEntries(new FormData(dom.editorForm).entries());
    const validation = validateEditor(state.editor.type, data);
    if (validation) {
      showDialogError(validation.message);
      const fieldNode = dom.editorForm.elements[validation.field];
      if (fieldNode) {
        fieldNode.setAttribute('aria-invalid', 'true');
        fieldNode.focus();
      }
      return;
    }

    dom.editorForm.querySelectorAll('[aria-invalid="true"]').forEach(function (node) { node.removeAttribute('aria-invalid'); });
    const payload = normalizePayload(state.editor.type, data);
    setBusy(dom.dialogSave, true);
    const result = await callEditorApi('save', {
      key: state.editor.type === 'contact' && state.editor.record ? state.sensitiveEditorKey : undefined,
      entity: state.editor.type,
      payload: payload,
      id: state.editor.record ? state.editor.record.id : null
    });
    setBusy(dom.dialogSave, false);
    if (result.error) {
      if (state.editor.type === 'contact' && result.error.code === '28000') {
        state.sensitiveEditorKey = '';
        showDialogError('La clave dejó de ser válida. Cierra el formulario e inténtalo nuevamente.');
        return;
      }
      showDialogError('No pudimos guardar los cambios. Revisa tu conexión y vuelve a intentarlo.');
      return;
    }

    state.editorDirty = false;
    closeEditor();
    toast('Cambios guardados.', 'success');
    await loadAllData(true);
  }

  function validateEditor(type, data) {
    if (type === 'contact') {
      if (!data.name.trim()) return issue('name', 'Escribe el nombre completo del responsable.');
      if (!data.role.trim()) return issue('role', 'Indica el rol del responsable.');
      if (!data.belongs_to) return issue('belongs_to', 'Selecciona a qué organización pertenece.');
      if (!data.phone.trim()) return issue('phone', 'Ingresa el teléfono del responsable.');
      if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) return issue('email', 'Corrige el formato del correo electrónico.');
    }
    if (type === 'event') {
      if (!data.title.trim()) return issue('title', 'Escribe el nombre del evento.');
      if (!data.event_date) return issue('event_date', 'Selecciona la fecha del evento.');
      if (!data.location.trim() && !data.maps_url.trim()) return issue('location', 'Agrega una dirección o un enlace de Google Maps.');
      if (data.maps_url && !isGoogleMapsUrl(data.maps_url)) return issue('maps_url', 'Pega un enlace válido de Google Maps.');
    }
    return null;
  }

  function normalizePayload(type, data) {
    const trimmed = {};
    Object.keys(data).forEach(function (key) { trimmed[key] = typeof data[key] === 'string' ? data[key].trim() : data[key]; });
    if (type === 'event') trimmed.start_time = trimmed.start_time || null;
    return trimmed;
  }

  function requestCloseEditor() {
    if (!state.editorDirty) {
      closeEditor();
      return;
    }
    if (!state.discardArmed) {
      state.discardArmed = true;
      dom.dialogCancel.textContent = 'Descartar cambios';
      showDialogError('Hay cambios sin guardar. Presiona “Descartar cambios” para cerrar sin guardarlos.');
      dom.dialogCancel.focus();
      return;
    }
    state.editorDirty = false;
    closeEditor();
  }

  function closeEditor() {
    if (dom.editorDialog.open) dom.editorDialog.close();
    state.editor = null;
    state.sensitiveEditorKey = '';
    state.editorDirty = false;
    state.discardArmed = false;
    dom.dialogCancel.textContent = 'Cancelar';
  }

  function handleContactSearch(event) {
    state.query = event.target.value;
    renderContacts();
  }

  function clearContactSearch() {
    state.query = '';
    dom.contactSearch.value = '';
    renderContacts();
    dom.contactSearch.focus();
  }

  function changeMonth(delta) {
    const parts = state.calendarMonth.split('-').map(Number);
    const date = new Date(Date.UTC(parts[0], parts[1] - 1 + delta, 1));
    state.calendarMonth = date.toISOString().slice(0, 7);
    renderCalendar();
  }

  async function callEditorApi(action, payload) {
    try {
      const response = await fetch(EDITOR_FUNCTION_URL, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      });
      const body = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        return {
          data: null,
          error: {
            code: response.status === 401 ? '28000' : 'EDGE_FUNCTION_ERROR',
            message: body.error || 'operation unavailable'
          }
        };
      }
      return { data: body.data, error: null };
    } catch (_error) {
      return { data: null, error: { code: 'NETWORK_ERROR', message: 'network unavailable' } };
    }
  }

  function nextEvent() {
    if (!state.events.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    return state.events.find(function (event) { return event.event_date >= today && event.status !== 'completed'; }) || state.events[state.events.length - 1];
  }

  function kpi(className, value, label) {
    return '<article class="kpi-card ' + className + '"><strong>' + Number(value || 0) + '</strong><span>' + safe(label) + '</span></article>';
  }

  function emptyState(title, copy, action) {
    return '<div class="empty-state"><strong>' + safe(title) + '</strong><span>' + safe(copy) + '</span>' + (action || '') + '</div>';
  }

  function field(label, name, value, type, required, inputmode, extraClass, placeholder, help) {
    const helpId = help ? 'field-' + safe(name) + '-help' : '';
    return '<div class="field ' + safe(extraClass || '') + '"><label for="field-' + safe(name) + '">' + safe(label) + '</label>' +
      '<input id="field-' + safe(name) + '" class="input" name="' + safe(name) + '" type="' + safe(type || 'text') + '" value="' + safe(value == null ? '' : value) + '"' + (required ? ' required' : '') + (inputmode ? ' inputmode="' + safe(inputmode) + '"' : '') + (placeholder ? ' placeholder="' + safe(placeholder) + '"' : '') + (help ? ' aria-describedby="' + helpId + '"' : '') + '>' + (help ? '<small id="' + helpId + '" class="field-help">' + safe(help) + '</small>' : '') + '</div>';
  }

  function renderEventLocation(event) {
    const location = event.location || 'Punto compartido en Google Maps';
    const url = googleMapsUrl(event.maps_url, location);
    return '<p class="event-location"><span>⌖ ' + safe(location) + '</span><a class="maps-link" href="' + safe(url) + '" target="_blank" rel="noopener noreferrer" aria-label="Abrir ' + safe(location) + ' en Google Maps">↗ Abrir en Google Maps</a></p>';
  }

  function googleMapsUrl(value, location) {
    if (isGoogleMapsUrl(value)) return String(value).trim();
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location || '');
  }

  function isGoogleMapsUrl(value) {
    if (!value) return false;
    try {
      const parsed = new URL(String(value).trim());
      const host = parsed.hostname.toLowerCase();
      return parsed.protocol === 'https:' && (
        host === 'maps.app.goo.gl' ||
        (host === 'goo.gl' && parsed.pathname.startsWith('/maps')) ||
        host.startsWith('maps.google.') ||
        (host.startsWith('www.google.') && parsed.pathname.startsWith('/maps')) ||
        (host.startsWith('google.') && parsed.pathname.startsWith('/maps'))
      );
    } catch (_error) {
      return false;
    }
  }

  function textareaField(label, name, value, extraClass) {
    return '<div class="field ' + safe(extraClass || '') + '"><label for="field-' + safe(name) + '">' + safe(label) + '</label><textarea id="field-' + safe(name) + '" class="input" name="' + safe(name) + '">' + safe(value || '') + '</textarea></div>';
  }

  function selectField(label, name, selected, options, extraClass) {
    const optionMarkup = Object.keys(options).map(function (key) {
      return '<option value="' + safe(key) + '"' + (String(selected) === String(key) ? ' selected' : '') + '>' + safe(options[key]) + '</option>';
    }).join('');
    return '<div class="field ' + safe(extraClass || '') + '"><label for="field-' + safe(name) + '">' + safe(label) + '</label><select id="field-' + safe(name) + '" class="input" name="' + safe(name) + '">' + optionMarkup + '</select></div>';
  }

  function showDialogError(message) {
    dom.dialogError.textContent = message;
    dom.dialogError.hidden = false;
  }

  function hideDialogError() {
    dom.dialogError.hidden = true;
    dom.dialogError.textContent = '';
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.classList.toggle('is-busy', busy);
    button.setAttribute('aria-busy', String(busy));
  }

  function toast(message, tone) {
    const node = document.createElement('div');
    node.className = 'toast toast-' + (tone || 'success');
    node.textContent = message;
    dom.toastRegion.replaceChildren(node);
    window.setTimeout(function () {
      if (node.parentNode) node.remove();
    }, 3500);
  }

  function renderMarkup(node, markup) {
    const parsed = new DOMParser().parseFromString('<body>' + markup + '</body>', 'text/html');
    node.replaceChildren.apply(node, Array.from(parsed.body.childNodes));
  }

  function safe(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) { return part[0]; }).join('').toUpperCase();
  }

  function findById(list, id) {
    return list.find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function affiliationClass(value) {
    return AFFILIATION_CLASSES[value] || 'affiliation-unassigned';
  }

  function issue(fieldName, message) { return { field: fieldName, message: message }; }

  function dateParts(iso) {
    const parts = String(iso || '').split('-');
    return { year: parts[0] || '—', month: MONTHS[Number(parts[1] || 1) - 1], day: parts[2] || '—' };
  }

  function formatDate(iso) {
    const parts = dateParts(iso);
    return parts.day + ' ' + parts.month.slice(0, 3) + ' ' + parts.year;
  }

  function formatTime(value) {
    if (!value) return 'Hora por confirmar';
    const parts = String(value).slice(0, 5).split(':');
    const hour = Number(parts[0]);
    const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
    const displayHour = hour % 12 || 12;
    return displayHour + ':' + parts[1] + ' ' + suffix;
  }

  function timeInput(value) {
    return value ? String(value).slice(0, 5) : '';
  }
})();
