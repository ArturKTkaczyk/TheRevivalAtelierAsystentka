// Pozwala testom importować pliki .ts bez rozszerzenia (jak w Next.js).
import { register } from "node:module";
register("./resolve-ts.mjs", import.meta.url);
