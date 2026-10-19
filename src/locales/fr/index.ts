import common from "./common.json" with { type: "json" };
import gaming from "./gaming.json" with { type: "json" };
import home from "./home.json" with { type: "json" };
import reader from "./reader.json" with { type: "json" };
import services from "./services.json" with { type: "json" };
import settings from "./settings.json" with { type: "json" };
import system from "./system.json" with { type: "json" };

export default { ...common, ...gaming, ...home, ...reader, ...services, ...settings, ...system };
