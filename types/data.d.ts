//Data the game loads: equipment JSON, and the scenario and campaign lists of game/resources

//One unit type of the equipment (Equipment.equipment[eqid]), the fields of the JSON parsehints
interface EquipmentEntry
{
	name: string;
	icon: string;           //sprite sheet path, resources/units/images/*.png
	country: number;
	uclass: number;         //unitClass
	target: number;         //unitType it counts as when attacked
	movmethod: number;      //movMethod
	movpoints: number;
	fuel: number;
	ammo: number;
	gunrange: number;
	spotrange: number;
	initiative: number;
	softatk: number;
	hardatk: number;
	airatk: number;
	navalatk: number;
	grounddef: number;
	airdef: number;
	closedef: number;
	rangedefmod: number;
	cost: number;
	yearavailable: number;
	yearexpired: number;
	embark: number;         //embarkType
	groundweight: number;
	airseaweight: number;
	attr: number;           //bit flags (bridge, ignores entrenchment, can't buy...)
}

//scenariolist.js: a category header is [title], a scenario is
//[file, name, description, axis players, allied players, equipment set]
type ScenarioListPlayer = { country: number; id: number };
type ScenarioListEntry = [string] | [string, string, string, ScenarioListPlayer[], ScenarioListPlayer[], string];

//campaignlist.js
interface CampaignListEntry
{
	title: string;
	desc: string;
	file: string;
	eqp: string;
	flag: number;
	prestige: number;
	scenarios: number;
}

declare var scenariolist: ScenarioListEntry[];
declare var campaignlist: CampaignListEntry[];
