# UserPlex

Administrador personal de cuentas de Plex, adaptable a iPhone y escritorio. Alta y edición de cuentas, gestión de personas, asignación y liberación, búsqueda, filtros, contraseñas ocultas con visualización temporal y respaldo cifrado.

## Acceso

Abre GitHub Pages y selecciona **Configurar mi acceso por primera vez** después de escribir tu contraseña. Confirma tu correo y entra. El servidor solo permite la cuenta administradora verificada. No hay registro de visitantes con acceso al panel.

En iPhone, guarda el acceso en Contraseñas. Toca el campo Contraseña para autorrellenar mediante Face ID. Es una función de iOS; no un sistema biométrico propio ni una passkey implementada por la app.

## Arquitectura y seguridad

La web estática se publica desde `docs/`. La base y Auth pertenecen exclusivamente a **Desarollos Fran**. `supabase/functions/plex-fran/index.ts` valida cada sesión contra Supabase Auth y comprueba el correo administrador verificado. La clave publicable del navegador es pública por diseño y no concede acceso a los datos.

Las tablas tienen RLS y niegan acceso directo a `anon` y `authenticated`. La función usa la clave de servicio disponible únicamente en el entorno de Supabase. Cifra los registros mediante AES-256-GCM, con IV aleatorio y una clave derivada de la clave de servicio. Ninguna contraseña de las cuentas está en este repositorio. Los índices de correo/nombre contienen hashes; las cuentas tienen números únicos.

Los tokens y registros permanecen en memoria, no en localStorage. La app oculta las contraseñas a los 20 segundos y se bloquea tras 10 minutos de inactividad, al salir de la página o tras 30 segundos en segundo plano. El portapapeles es responsabilidad del sistema al copiar una contraseña.

La función valida la sesión por sí misma; se despliega con `verify_jwt=false` porque utiliza claves publicables modernas y una verificación explícita con Auth. No existe acceso anónimo a los datos. Los administradores del proyecto Supabase conservan control administrativo.

**Rotación:** si cambia la clave de servicio legacy utilizada por la función, migra primero el cifrado con la clave anterior; cambiarla sin migración impediría descifrar registros existentes. Conserva respaldos cifrados. El respaldo usa PBKDF2-SHA256 (310000 iteraciones) y AES-GCM.

Los cambios son administrativos: no modifican automáticamente las credenciales ni los permisos reales en Plex.

## Desarrollo

Supabase SDK vendorizado: `@supabase/supabase-js` 2.105.0 (MIT). No requiere compilación para servir `docs/`.

Para desplegar la función: `supabase functions deploy plex-fran --no-verify-jwt` tras autenticar el CLI y vincular el proyecto correcto. El esquema se conserva en `database/schema.sql`. No vuelvas a importar datos iniciales: ya están cifrados en la base y no se distribuyen como fixtures.

Pruebas de seguridad y CRUD: `node --test tests/security.test.mjs`. El backend compilado para esas pruebas se genera desde TypeScript con esbuild; no contiene credenciales reales.
