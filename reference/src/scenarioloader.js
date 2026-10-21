/**
 * ScenarioLoader - Loads XML scenarios as exported from mapconvert.py script
 *
 * http://www.linuxconsulting.ro
 * http://openpanzer.net
 *
 * Copyright (c) 2012 Nicu Pavel
 * Licensed under the GPL license:
 * http://www.gnu.org/licenses/gpl.html
 *
 * Reconstructed from the Panzer Marshal 3.2.14 bundle, names and comments
 * carried over from the openpanzer 2.9 source where the code matches.
 */

//Loading is asynchronous: the scenario XML, then the map image (its size gives the real map
//size), then the equipment of the players countries. scen.onLoadFinished() is called at the
//end, with scen.isLoaded telling if the scenario loaded.
function ScenarioLoader()
{
	var scen = null;

	this.noCache = true; //add a timestamp to the scenario url so the browser doesn't cache it

	this.loadScenario = function(scenarioObject)
	{
		var xmlHttp = new XMLHttpRequest();
		var url;

		scen = scenarioObject;
		url = Scenario.scenarioPath + scen.file;
		if (this.noCache)
			url += "?_=" + new Date().getTime();

		xmlHttp.onload = function()
		{
			if (xmlHttp.readyState === 4)
			{
				if (xmlHttp.status === 200 || xmlHttp.status === 0)
					parseScenario(xmlHttp.responseXML);
				else
					parseScenario(null);
			}
		}
		xmlHttp.open("GET", url, true);
		xmlHttp.send(null);
	}

	// Private functions
	function parseScenario(xmlData)
	{
		if (xmlData == null || !parseMapHeader(xmlData))
			loadFailed();
	}

	//Inlined into parseScenario in the bundle
	function parseMapHeader(xmlData)
	{
		var mapHeader = xmlData.getElementsByTagName("map")[0];
		if (mapHeader)
		{
			//The 2.9 check for 0 < rows, cols < 99 is gone, the map image decides the size
			var rows = +mapHeader.getAttribute("rows");
			var cols = +mapHeader.getAttribute("cols");
			var eqp = mapHeader.getAttribute("eqp");
			var turnsModifier = 1;

			if (game && game.campaign)
				turnsModifier = difficultyModifiers[game.campaign.difficulty].extraTurns;

			scen.map.rows = rows;
			scen.map.cols = cols;
			if (eqp)
			{
				scen.eqp = eqp;
				Equipment.name = eqp;
			}
			scen.map.victoryTurns = mapHeader.getAttribute("turns").split(", ");

			for (var i = 0; i < scen.map.victoryTurns.length; i++)
				scen.map.victoryTurns[i] = +scen.map.victoryTurns[i] //convert to int

			scen.map.victoryTurns[2] = Math.round(scen.map.victoryTurns[2] * turnsModifier);
			scen.map.maxTurns = scen.map.victoryTurns[2]; //tactical victory

			//TODO move more generics from map to scenario object
			scen.maxTurns = scen.map.victoryTurns[2]; //tactical victory
			scen.date.setTime(Date.parse(mapHeader.getAttribute("date")));
			scen.atmosferic = +mapHeader.getAttribute("atmosferic");
			scen.latitude = +mapHeader.getAttribute("latitude");
			scen.ground = +mapHeader.getAttribute("ground");
			scen.turnsPerDay = +mapHeader.getAttribute("dayturns") || 1;
			scen.turnsPerDay *= 2;
			scen.map.terrainImage = mapHeader.getAttribute("image");

			loadMapImage(xmlData);

			return true;
		}
		return false;
	}

	function loadFailed()
	{
		scen.isLoaded = false;
		scen.onLoadFinished();
	}

	//Called after each equipment file loaded, the last one loads the rest of the scenario
	function equipmentLoaded(players, xmlData)
	{
		if (--Equipment.equipmentToLoad)
			return;

		//Units need the equipment so players are added only now
		for (var i = 0; i < players.length; i++)
		{
			var p = new Player();
			p.copy(players[i]);
			scen.map.addPlayer(p);
		}
		loadReinforcements(xmlData);
		loadHexes(xmlData);

		scen.isLoaded = true;
		scen.onLoadFinished();
	}

	//Inlined into equipmentLoaded in the bundle
	function loadReinforcements(xmlData)
	{
		var reinforceNodes = xmlData.getElementsByTagName("reinforce");
		if (reinforceNodes)
		{
			for (var i = 0; i < reinforceNodes.length; i++)
			{
				var turn = +reinforceNodes[i].getAttribute("turn");
				if (turn === null) //never true, turn is a number here
					continue;

				for (var j = 0; j < reinforceNodes[i].childNodes.length; j++)
				{
					if (reinforceNodes[i].childNodes[j].nodeName != "at")
						continue;

					var atNode = reinforceNodes[i].childNodes[j];
					var row = +atNode.getAttribute("row");
					var col = +atNode.getAttribute("col");
					if (row == null || col == null) //never true, row and col are numbers
						continue;

					for (var k = 0; k < atNode.childNodes.length; k++)
					{
						if (atNode.childNodes[k].nodeName == "unit")
						{
							//u is not declared: an implicit global, kept as in the bundle
							u = loadUnit(atNode.childNodes[k]);
							if (u !== null)
								scen.addReinforcement(turn, row, col, u);
						}
					}
				}
			}
		}
	}

	//Inlined into equipmentLoaded in the bundle
	function loadHexes(xmlData)
	{
		var hexNodes = xmlData.getElementsByTagName("hex");
		if (hexNodes)
		{
			var hex = null;
			var v = null;
			var row, col;
			for (var i = 0; i < hexNodes.length; i++)
			{
				row = +hexNodes[i].getAttribute("row");
				col = +hexNodes[i].getAttribute("col");
				//Hexes outside of the map (cut by the map image size) are skipped
				if (row >= scen.map.rows || col >= scen.map.cols)
					continue;
				hex = scen.map.map[row][col];
				if (!hex || typeof hex === "undefined")
					continue;

				if ((v = hexNodes[i].getAttribute("terrain")) !== null)
					hex.terrain = +v;
				if ((v = hexNodes[i].getAttribute("road")) !== null)
					hex.road = +v;
				if ((v = hexNodes[i].getAttribute("name")) !== null)
					hex.name = v;
				if ((v = hexNodes[i].getAttribute("flag")) !== null)
					hex.flag = +v;
				if ((v = hexNodes[i].getAttribute("owner")) !== null)
					hex.owner = +v;
				if ((v = hexNodes[i].getAttribute("victory")) !== null)
					hex.victorySide = +v;
				if ((v = hexNodes[i].getAttribute("deploy")) !== null)
					hex.isDeployment = +v;
				//Supply hexes are deployment hexes too, unless the hex has a deploy side
				if ((v = hexNodes[i].getAttribute("supply")) !== null && hex.isDeployment == -1)
					hex.isDeployment = +v;

				for (var j = 0; j < hexNodes[i].childNodes.length; j++)
				{
					if (hexNodes[i].childNodes[j].nodeName == "unit")
					{
						v = loadUnit(hexNodes[i].childNodes[j]);
						if (v !== null)
							hex.setUnit(v);
					}
				}
				scen.map.setHex(row, col);
			}
		}
	}

	//The map size is computed from the map image, the scenario rows/cols are only an upper limit
	function loadMapImage(xmlData)
	{
		var img = new Image();
		img.src = scen.map.terrainImage;
		img.onload = function(event)
		{
			var rows = scen.map.rows;
			var cols = scen.map.cols;
			var width = img.width;
			var imgCols = 1;
			var imgRows = img.height / 50; //hex height
			var isLastColPartial = false;
			var isLastRowPartial = false;

			//Hexes alternate 60 and 30 pixels of width
			while (width >= 30)
			{
				if (imgCols % 2)
					width -= 60;
				else
					width -= 30;
				imgCols++;
			}
			isLastColPartial = width < 0;

			var fullRows = imgRows;
			var rowFraction = imgRows - Math.floor(imgRows);
			if (rowFraction >= 0.39 && rowFraction < 0.8)
			{
				isLastRowPartial = true;
				fullRows = Math.ceil(imgRows);
			}
			else if (rowFraction >= 0.8)
			{
				isLastRowPartial = false;
				fullRows = Math.ceil(imgRows);
			}
			else if (rowFraction < 0.39)
			{
				isLastRowPartial = false;
				fullRows = Math.floor(imgRows);
			}

			if (fullRows > 0 && (rows > fullRows || rows == 0))
				rows = fullRows;
			if (imgCols > 0 && (cols > imgCols || cols == 0))
				cols = imgCols;

			scen.map.rows = rows;
			scen.map.cols = cols;
			scen.map.isLastColPartial = isLastColPartial;
			scen.map.isLastRowPartial = isLastRowPartial;
			scen.map.allocMap();

			var players = loadPlayers(xmlData);
			Equipment.addPlayersEquipment(players, equipmentLoaded.bind(null, players, xmlData));
		}
		img.onerror = loadFailed;
	}

	//Inlined into loadMapImage in the bundle. Players are only parsed here, they are added
	//to the map after the equipment loaded
	function loadPlayers(xmlData)
	{
		var playerNodes = xmlData.getElementsByTagName("player");
		var players = [];
		var minPrestige = 0; //campaigns give a minimum prestige per turn

		if (game && game.campaign)
			minPrestige = Math.round(game.campaign.startprestige
				* difficultyModifiers[game.campaign.difficulty].turnPrestige);

		if (playerNodes)
		{
			for (var i = 0; i < playerNodes.length; i++)
			{
				var p = new Player();
				var v;
				p.id = +playerNodes[i].getAttribute("id");
				p.side = +playerNodes[i].getAttribute("side");
				p.country = +playerNodes[i].getAttribute("country");
				p.airTransports = +playerNodes[i].getAttribute("airtrans");
				p.navalTransports = +playerNodes[i].getAttribute("navaltrans");

				p.prestigePerTurn = playerNodes[i].getAttribute("turnprestige").split(", ");
				for (var j = 0; j < p.prestigePerTurn.length; j++)
				{
					v = +p.prestigePerTurn[j]; //convert to int
					p.prestigePerTurn[j] = v;
					if (v < minPrestige)
						p.prestigePerTurn[j] = minPrestige;
				}

				//Set start prestige
				p.prestige = p.prestigePerTurn[0];

				//Only the countries that are set
				p.supportCountries = [];
				v = playerNodes[i].getAttribute("support").split(", ");
				for (j = 0; j < v.length; j++)
					if (+v[j] > 0)
						p.supportCountries.push(+v[j]);

				players.push(p);
			}
		}
		return players;
	}

	function loadUnit(node)
	{
		//create the unit object
		var unitId = +node.getAttribute("id");
		var playerId = +node.getAttribute("owner");
		var u = null;
		var v, side;

		if (unitId >= 0 && playerId >= 0)
		{
			u = new Unit(unitId);
			u.owner = playerId >> 0;
			if ((v = node.getAttribute("face")) !== null)
				u.facing = +v;
			if ((v = node.getAttribute("flag")) !== null)
				u.flag = +v;
			if ((v = node.getAttribute("transport")) !== null)
				u.setTransport(+v);
			if ((v = node.getAttribute("carrier")) !== null)
				u.carrier = +v;
			if ((v = node.getAttribute("exp")) !== null)
				u.experience = +v;
			if ((v = node.getAttribute("ent")) !== null)
				u.entrenchment = +v;
			if ((v = node.getAttribute("str")) !== null)
				u.strength = +v;
			if (node.getAttribute("ldr") !== null)
				u.leader = Leaders.generateLeader(u);

			//Ground and air units costs and experience per side
			if (!GameRules.isSea(u))
			{
				side = scen.map.getPlayer(u.owner).side;
				u.unitData(true); //unused
				scen.unitsCostPerSide[side] += GameRules.calculateUnitCosts(u.eqid,
					u.transport ? u.transport.eqid : null);
				scen.expPerSide[side].exp += u.experience;
				scen.expPerSide[side].count++;
			}

			return u;
		}
		return null;
	}
}
