import { defineReviewer } from "./define.ts";

/** Schema, model, migration and SQL files: the only files this reviewer reads. */
const DATA_PATH =
  /(^|\/)(migrations?|alembic|prisma)\/|(^|\/)db\/migrate\/|(^|\/)(schemas?|models?|entities|entity)(\/|\.[a-z]+$)|\.(sql|prisma)$/i;

export default defineReviewer({
  id: "data",
  name: "Data",
  description: "Migrations, schema and models: destructive changes, types, indexes and constraints.",
  badge: "data",
  role: "smart",
  tools: false,
  appliesTo: (path) => DATA_PATH.test(path),
  instructions: `Find schema and data problems in this change:
- destructive migrations (dropping or renaming a column or table) with no step that keeps the data
- a NOT NULL column added without a default or a backfill
- money stored as a float or double; timestamps without a time zone; precision lost by narrowing a type
- a new query pattern or foreign key without an index; a uniqueness the code relies on without a constraint
- the model and the migration disagreeing about a column`,
});
