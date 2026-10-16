# Release notes — perf.kontentferma.com (KR-perf)

Новое — сверху. Claude дописывает блок «Не опубликовано» вместе с правками кода;
при коммите этот блок становится описанием релиза: переименуй заголовок в дату/версию.

## Не опубликовано

### Задачи Performance — в my.kontentferma

- Новый `src/routes/ingest.js`, подключён в `server.js` как `/api/ingest`:
  - `GET /api/ingest/tasks` — все задачи (кроме проектов в архиве) с названием проекта, справочник статусов и PUBLIC_URL;
  - `POST /api/ingest/tasks/:id/status` `{ status }` — смена статуса из my.kontentferma (галочка «выполнено»), `done_at` ставится/снимается как в обычном редактировании.
- Ключ — заголовок `X-Api-Key`: `KF_MY_API_KEY` (тот же общий ключ, что уже нужен для ролей из my) или `AUTOMATION_API_KEY`. Новых переменных не нужно.
