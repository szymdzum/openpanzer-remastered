//Globals the game uses without declaring them

//Implicit globals: assignments to undeclared names in the original code, kept as they are
//(see the comments where they are assigned). Typed loosely on purpose.
declare var aInitiative: number;   //gamerules calculateAttackResults
declare var dInitiative: number;
declare var u: any;                //scenarioloader, aiscripted
declare var e: any;                //aiscripted
declare var t: any;                //scenario copy
declare var c: any;                //combatlog addCombatEnd
declare var h: any;                //ai buildActions
declare var div: any;              //uibuilder
declare var firstTurn: any;        //aiscripted
declare var map: any;              //Map.attackUnit reads a global map that doesn't exist

//Platform APIs the game checks for: Chrome apps, NW.js
declare var chrome: any;
declare var nw: any;
