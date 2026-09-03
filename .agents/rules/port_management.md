# Regla de Operación: Verificación y Reasignación Automática de Puertos

1. **Prohibido usar o asumir puertos por defecto sin verificar:**
   - Nunca intentes ejecutar servicios directamente en `5173`, `3000` u `8000` sin comprobar disponibilidad previa.
   - El puerto `5173` está reservado/ocupado habitualmente por otros entornos del usuario.
2. **Verificación previa obligatoria:**
   - Antes de iniciar cualquier servicio (Vite, FastAPI, etc.), verifica si el puerto objetivo está ocupado (`Get-NetTCPConnection -LocalPort <PUERTO>`).
3. **Reasignación dinámica y transparente:**
   - Si el puerto está ocupado por otro proceso, busca inmediatamente el siguiente puerto libre disponible (`5180`, `5181`, `5182`... o `8009`, `8010`...).
   - Ajusta automáticamente la configuración del proyecto (por ejemplo `vite.config.ts`, `--port <PUERTO>` o el proxy `/api`) para que los servicios se comuniquen sin errores de colisión.
   - Nunca termines procesos externos del usuario para liberar puertos; reasigna el servicio del proyecto.
