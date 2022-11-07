/*jslint node: true */
/*jshint -W061 */
/*global goog, Map, let */
"use strict";
// General requires
require('google-closure-library');
goog.require('goog.structs.PriorityQueue');
goog.require('goog.structs.QuadTree');

const GLOBAL = require("./modules/global.js");
console.log(`[${GLOBAL.creationDate}]: Server initialized.\nRoom Info:\nDimensions: ${room.width} x ${room.height}\nMax Food / Nest Food: ${room.maxFood} / ${room.maxFood * room.nestFoodAmount}`);

// Let's get a cheaper array removal thing
Array.prototype.remove = function(index) {
    if (index === this.length - 1) return this.pop();
    let r = this[index];
    this[index] = this.pop();
    return r;
};

util.log(room.width + ' x ' + room.height + ' room initalized.  Max food: ' + room.maxFood + ', max nest food: ' + (room.maxFood * room.nestFoodAmount) + '.');

// The most important loop. Fast looping.
const gameloop = (() => {
    // Collision stuff
    function collide(collision) {
        // Pull the two objects from the collision grid      
        let instance = collision[0],
            other = collision[1];
        // Check for ghosts...
        if (other.isGhost) {
            util.error('GHOST FOUND');
            util.error(other.label);
            util.error('x: ' + other.x + ' y: ' + other.y);
            util.error(other.collisionArray);
            util.error('health: ' + other.health.amount);
            util.warn('Ghost removed.');
            if (grid.checkIfInHSHG(other)) {
                util.warn('Ghost removed.');
                grid.removeObject(other);
            }
            return 0;
        }
        if (instance.isGhost) {
            util.error('GHOST FOUND');
            util.error(instance.label);
            util.error('x: ' + instance.x + ' y: ' + instance.y);
            util.error(instance.collisionArray);
            util.error('health: ' + instance.health.amount);
            if (grid.checkIfInHSHG(instance)) {
                util.warn('Ghost removed.');
                grid.removeObject(instance);
            }
            return 0;
        }
        if (!instance.activation.check() && !other.activation.check()) {
            return 0;
        }
        let conversion = ['bullet', 'drone', 'swarm', 'trap', 'block', 'minion', 'air', 'sentry', 'crasher']
        let avoid = ['bullet', 'drone', 'swarm', 'trap', 'block', 'minion', 'air']
        let bholeignore = ['bhole', 'bholeignore']
        let blowavoid = ['air']
        switch (true) {
            case (
                (instance.type == 'Air' && !avoid.includes(other.type) && instance.master !== other) ||
                (other.type == 'Air' && !avoid.includes(instance.type) && other.master !== instance)
            ):
                vacuumcollide(instance, other);
                break;
            case (
                (instance.type == 'BAir' && !blowavoid.includes(other.type) && instance.master !== other) ||
                (other.type == 'BAir' && !blowavoid.includes(instance.type) && other.master !== instance)
            ):
                vacuumcollide(instance, other, 33);
                break;
            
            case (
                (instance.label === 'Deflector Shield' && conversion.includes(other.type) && instance.master !== other) ||
                (other.label === 'Deflector Shield' && conversion.includes(instance.type) && other.master !== instance)
            ):
                conversioncollide(instance, other);
                break;
            
            case (
                (instance.type === 'bhole' && !bholeignore.includes(other.type) && instance.master !== other) ||
                (other.type === 'bhole' && !bholeignore.includes(instance.type) && other.master !== instance)
            ):
                suckywuckycollideuwu(instance, other);
                break;
            
            
            case (instance.type === "wall" || other.type === "wall"):
                if (instance.type === "wall" && other.type === "wall") return;
                let wall = instance.type === "wall" ? instance : other;
                let entity = instance.type === "wall" ? other : instance;
                switch (wall.shape) {
                    case 4:
                        reflectCollide(wall, entity)
                        break;
                    case 0:
                        mooncollide(wall, entity);
                        break;
                    default:
                        let a = ((entity.type === "bullet") ? 1 + 10 / (entity.velocity.length + 10) : 1);
                        advancedcollide(wall, entity, false, false, a);
                        break;
                };
                break;
            case (instance.team === other.team && (instance.settings.hitsOwnType === "pushOnlyTeam" || other.settings.hitsOwnType === "pushOnlyTeam")): { // Dominator / Mothership collisions
                if (instance.settings.hitsOwnType === other.settings.hitsOwnType) return;
                let pusher = instance.settings.hitsOwnType === "pushOnlyTeam" ? instance : other;
                let entity = instance.settings.hitsOwnType === "pushOnlyTeam" ? other : instance;
                if (entity.type !== "tank" || entity.settings.hitsOwnType === "never") return;
                let a = 1 + 10 / (Math.max(entity.velocity.length, pusher.velocity.length) + 10);
                advancedcollide(pusher, entity, false, false, a);
            }
            break;
        
            case ((instance.type === 'crasher' && other.type === 'food') || (other.type === 'crasher' && instance.type === 'food')):
            firmcollide(instance, other);
            break;
        case ((instance.team !== other.team)&&
             (instance.type === 'healing' && instance.master !== other) ||
              (other.type === 'healing' && other.master !== instance)
             ):
            healcollide(instance, other, 0.44);
            break;
        case (instance.team !== other.team):
            advancedcollide(instance, other, true, true);
            break;
        case (instance.settings.hitsOwnType == 'never' || other.settings.hitsOwnType == 'never'):
            break;
        case (instance.settings.hitsOwnType === other.settings.hitsOwnType):
            switch (instance.settings.hitsOwnType) {
                case 'push':
                    advancedcollide(instance, other, false, false);
                    break;
                case 'hard':
                    firmcollide(instance, other);
                    break;
                case 'hardWithBuffer':
                    firmcollide(instance, other, 30);
                    break;
                case "hardOnlyTanks":
                    if (instance.type === "tank" && other.type === "tank" && !instance.isDominator && !other.isDominator) firmcollide(instance, other);
                case "hardOnlyBosses":
                    if (instance.type === other.type && instance.type === "miniboss") firmcollide(instance, other);
                case 'repel':
                    simplecollide(instance, other);
                    break;
            };
            break;
        };
    };
    // Living stuff
    function entitiesactivationloop(my) {
        // Update collisions.
        my.collisionArray = [];
        // Activation
        my.activation.update();
        my.updateAABB(my.activation.check());
    }

    function entitiesliveloop(my) {
        // Consider death.
        if (my.contemplationOfMortality()) my.destroy();
        else {
            if (my.bond == null) {
                // Resolve the physical behavior from the last collision cycle.
                logs.physics.set();
                my.physics();
                logs.physics.mark();
            }
            if (my.activation.check() || my.isPlayer) {
                logs.entities.tally();
                // Think about my actions.
                logs.life.set();
                my.life();
                logs.life.mark();
                // Apply friction.
                my.friction();
                my.confinementToTheseEarthlyShackles();
                logs.selfie.set();
                my.takeSelfie();
                logs.selfie.mark();
            }
            entitiesactivationloop(my);
        }
        // Update collisions.
        my.collisionArray = [];
    }
    let time;
    // Return the loop function
    let ticks = 0;
    return () => {
        logs.loops.tally();
        logs.master.set();
        logs.activation.set();
        logs.activation.mark();
        // Do collisions
        logs.collide.set();
        if (entities.length > 1) {
            // Load the grid
            grid.update();
            // Run collisions in each grid
            const pairs = grid.queryForCollisionPairs();
            loopThrough(pairs, collide);
        }
        logs.collide.mark();
        // Do entities life
        logs.entities.set();
        for (let e of entities) entitiesliveloop(e);
        logs.entities.mark();
        logs.master.mark();
        // Remove dead entities
        purgeEntities();
        room.lastCycle = util.time();
        ticks++;
        if (isEven(ticks)) {
            loopThrough(sockets.players, function(instance) {
                instance.socket.view.gazeUpon();
                instance.socket.lastUptime = Infinity;
            });
            if (Math.min(1, global.fps / roomSpeed / 1000 * 30) < 0.8) antiLagbot();
        }
    };
  
})();

setTimeout(closeArena, 60000 * 120); // Restart every 2 hours


 
var poisonLoop = (() => {
    // Fun stuff, like RAINBOWS :D
    function poison(my) {
      entities.forEach(function(element) {
        if (element.showpoison) {
            let x = element.size + 10
            let y = element.size + 10
            Math.random() < 0.5 ? x *= -1 : x
            Math.random() < 0.5 ? y *= -1 : y
            Math.random() < 0.5 ? x *= Math.random() + 1 : x
            Math.random() < 0.5 ? y *= Math.random() + 1 : y
            var o = new Entity({
            x: element.x + x,
            y: element.y + y
            })
            o.define(Class['poisonEffect'])
        }
          if (element.poisoned && element.type == 'tank' || element.poisoned && element.type == 'food' || element.poisoned && element.type == 'crasher'|| element.poisoned && element.type == 'mothership'
             || element.poisoned && element.type == 'miniboss') {
      
       
           
            if (!element.invuln) {
              
              
               element.shield.amount -= 1
               element.health.amount -= 2
            }
          if (!element.passive) {
              // element.health.amount -= element.health.max / (55 - element.poisonLevel)
              // element.shield.amount -= element.shield.max / (35 - element.poisonLevel)
            }
           
            element.poisonTime -= 1
            if (element.poisoned <= 0) element.poisoned = false
          
           
            if (element.health.amount <= 0 && element.poisonedBy != undefined && element.poisonedBy.skill != undefined && element.skill != undefined) {
                element.poisonedBy.skill.score += element.skill.score;
              element.poisonedBy.sendMessage('You ursurped ' + element.name + ' with poison.');
              element.sendMessage('You have been ursurped by ' + element.poisonedBy.name + ' with poison.')
            }
          }
         if (element.poisoned && element.type == 'bullet' || element.poisoned && element.type == 'trap'|| element.poisoned && element.type == 'minion' 
             || element.poisoned && element.type == 'drone'|| element.poisoned && element.type == 'swarm'||element.poisoned && element.type == 'crasher') {
           
            if (!element.invuln) {
              
              
               element.shield.amount -= 1
               element.health.amount -= 2
            }
          if (!element.passive) {
              // element.health.amount -= element.health.max / (55 - element.poisonLevel)
              // element.shield.amount -= element.shield.max / (35 - element.poisonLevel)
            }
           
            element.poisonTime -= 1
            if (element.poisonTime <= 0) element.poisoned = false
           
          }
        
          
      }
    )}
    return () => {
        // run the poison
        poison()
    };
})();
var iceLoop = (() => {
    // Fun stuff, like RAINBOWS :D
    function ice(my) {
      entities.forEach(function(element) {
        if (element.showice) {
            let x = element.size + 10
            let y = element.size + 10
            Math.random() < 0.5 ? x *= -1 : x
            Math.random() < 0.5 ? y *= -1 : y
            Math.random() < 0.5 ? x *= Math.random() + 1 : x
            Math.random() < 0.5 ? y *= Math.random() + 1 : y
            var o = new Entity({
            x: element.x + x,
            y: element.y + y
            })
            o.define(Class['iceEffect'])
        }
          if (element.iceed && element.type == 'food'||element.iceed && element.type == 'tank'||element.iceed && element.type == 'miniboss'||element.iceed && element.type == 'mothership'
              ||element.iceed && element.type == 'bullet'||element.iceed && element.type == 'trap'
              ||element.iceed && element.type == 'minion'||element.iceed && element.type == 'drone'||element.iceed && element.type == 'swarm'||element.iceed && element.type == 'crasher') {
             
          
            if (!element.invuln) {
              element.velocity.x -= element.velocity.x / (0.65 - element.iceLevel);
              element.velocity.y -= element.velocity.y / (0.65 - element.iceLevel);
               
            
               
            
                 }
            element.iceTime -= 1
            if (element.iceTime <= 0) element.iceed = false
           
            // if (element.health.amount <= 0 && element.iceedBy != undefined && element.iceedBy.skill != undefined) {
            //   element.iceedBy.skill.score += Math.ceil(util.getJackpot(element.iceedBy.skill.score));
            //   element.iceedBy.sendMessage('You killed ' + element.name + ' with Ice.');
            //   element.sendMessage('You have been killed ' + element.iceededBy.name + ' with Ice.')
            // }
          }
      }
        )}
    return () => {
        //run the ice
        ice()
    };
})(); 

// A less important loop. Runs at an actual 5Hz regardless of game speed.
const maintainloop = (() => {
    // Place obstacles
    function placeRoids() {
        function placeRoid(type, entityClass) {
            let x = 0;
            let position;
            do {
                position = room.randomType(type);
                x++;
                if (x > 200) {
                    util.warn("Could not place some roids.");
                    return 0;
                }
            } while (dirtyCheck(position, 10 + entityClass.SIZE));
            let o = new Entity(position);
            o.define(entityClass);
            o.team = -101;
            o.facing = ran.randomAngle();
            o.protect();
            o.life();
        }
        // Start placing them
        let roidcount = room.roid.length * room.width * room.height / room.xgrid / room.ygrid / 50000 / 1.5;
        let rockcount = room.rock.length * room.width * room.height / room.xgrid / room.ygrid / 250000 / 1.5;
        let count = 0;
        for (let i = Math.ceil(roidcount); i; i--) {
            count++;
            placeRoid('roid', Class.obstacle);
        }
        for (let i = Math.ceil(roidcount * 0.3); i; i--) {
            count++;
            placeRoid('rock', Class.babyObstacle);
        }
        for (let i = Math.ceil(rockcount * 0.8); i; i--) {
            count++;
            placeRoid('rock', Class.obstacle);
        }
        for (let i = Math.ceil(rockcount * 0.5); i; i--) {
            count++;
            placeRoid('rock', Class.babyObstacle);
        }
        util.log('Placing ' + count + ' obstacles!');
    }
    placeRoids();

    function spawnWall(loc) {
        let o = new Entity(loc);
        o.define(Class.mazeWall);
        o.team = -101;
        o.SIZE = (room.width / room.xgrid) / 2;
        o.protect();
        o.life();
    };
    // function spawnHealer(loc) {
    //   let o = new Entity(loc);
    //   o.define(Class.bighealer);
    //   o.team = -101;
    //   o.protect();
    //   o.life();
    // }
    for (let loc of room["wall"]) spawnWall(loc);
    // for (let loc of room["hyou"]) spawnHealer(loc);
    // Spawning functions
    let spawnBosses = (() => {
        let timer = Math.round((c.bossSpawnInterval || 8) * 20); // It's in minutes
        const selections = [{
            bosses: [Class.elite_destroyer, Class.elite_sprayer, Class.elite_gunner, Class.elite_battleship],
            location: "nest",
            amount: [1, 3],
            nameType: "a",
            message: "Influx detected...",
            chance: 3
        }, {
           bosses: [Class.elite_destroyer, Class.elite_sprayer, Class.elite_gunner, Class.elite_battleship],
            location: "nest",
            amount: [1, 2],
            nameType: "a",
            message: "Influx detected...",
            chance: 2
        }, {
            bosses: [Class.palisade, Class.summoner, Class.skimboss, Class.nestKeeper],
            location: "norm",
            amount: [1, 2],
            nameType: "castle",
            message: "A strange trembling...",
            chance: 1
        }];
        return (census) => {
            if (!census.miniboss && !timer --) {
                timer --;
                const selection = selections[ran.chooseChance(...selections.map(selection => selection.chance))];
                const amount = Math.floor(Math.random() * selection.amount[1]) + selection.amount[0];
                sockets.broadcast(amount > 1 ? "Visitors are coming..." : "A visitor is coming...");
                if (selection.message) {
                    setTimeout(sockets.broadcast, 2500, selection.message);
                }
                setTimeout(() => {
                    const names = ran.chooseBossName(selection.nameType, amount);
                    sockets.broadcast(amount > 1 ? util.listify(names) + " have arrived!" : names[0] + " has arrived!");
                    names.forEach((name, i) => {
                        let spot, m = 0;
                        do {
                            spot = room.randomType(selection.location);
                            m ++;
                        } while (dirtyCheck(spot, 500) && m < 30);
                        let boss = new Entity(spot);
                        boss.name = name;
                        boss.define(selection.bosses.sort(() => .5 - Math.random())[i % selection.bosses.length]);
                        boss.team = -100;
                    });
                }, 5000);
                timer = Math.round((c.bossSpawnInterval || 8) * 25); // 5 seconds due to spawning process
            }
        }
    })();
     let spawnBosses1 = (() => {
        let timer = 0;
        let boss = (() => {
            let i = 0,
                names = [],
                bois = [Class.egg],
                n = 0,
                begin = 'yo some shit is about to move to a lower position',
                arrival = 'Something happened lol u should probably let Neph know this broke',
                loc = 'norm';
            let spawn = () => {
                let spot, m = 0;
                do {
                    spot = room.randomType(loc); m++;
                } while (dirtyCheck(spot, 500) && m<30);
                let o = new Entity(spot);
                    o.define(ran.choose(bois));
                    o.team = -100;
                    o.name = names[i++];
            };
            return {
                prepareToSpawn: (classArray, number, nameClass, typeOfLocation = 'norm') => {
                    n = number;
                    bois = classArray;
                    loc = typeOfLocation;
                    names = ran.chooseBossName(nameClass, number);
                    i = 0;
                    if (n === 1) {
                        begin = 'A visitor is coming.';
                        arrival = names[0] + ' has arrived.'; 
                    } else {
                        begin = 'Visitors are coming.';
                        arrival = '';
                        for (let i=0; i<n-2; i++) arrival += names[i] + ', ';
                        arrival += names[n-2] + ' and ' + names[n-1] + ' have arrived.';
                    }
                },
                spawn: () => {
                    sockets.broadcast(begin);
                    for (let i=0; i<n; i++) {
                        setTimeout(spawn, ran.randomRange(3500, 5000));
                    }
                    // Wrap things up.
                    setTimeout(() => sockets.broadcast(arrival), 5000);
                    util.log('[SPAWN] ' + arrival);
                },
            };
        })();
        return census => {
            if (timer > 60 && ran.dice(60 - timer)) {
                util.log('[SPAWN] Preparing to spawn...');
                timer = -1500;
                let choice = [];
                switch (ran.chooseChance(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)) {
                    case 0: 
                        choice = [[Class.elite_destroyer, Class.elite_sprayer, Class.elite_gunner, Class.elite_battleship], 2, 'a', 'nest'];
                        break;
                    case 1: 
                       choice = [[Class.elite_destroyer, Class.elite_sprayer, Class.elite_gunner, Class.elite_battleship], 3, 'a', 'nest'];
                        break;
                     case 2: 
                        choice = [[Class.skimboss, Class.palisade], 1, 'castle', 'norm']; 
                        sockets.broadcast('A strange trembling...');
                        break;
                    
                }
              
                boss.prepareToSpawn(...choice);
                setTimeout(boss.spawn, 3000);
                // Set the timeout for the spawn functions
            } else if (!census.miniboss) timer++;
        };
    })();
  let spawnCrasher2 = census => {
        if (ran.chance(3 -  0.5 * census.crasher / room.maxFood / room.nestFoodAmount)) {
            let spot, i = 30;
            do { spot = room.randomType('nest'); i--; if (!i) return 0; } while (dirtyCheck(spot, 100));
          
          //let type = (ran.dice(10000)) ? ran.choose([Class.sentryGun, Class.sentrySwarm, Class.sentryTrap, Class.semicrusher, Class.arrowCrasher, Class.crusher, Class.visDestructia, Class.destroyerCrasher, Class.triblade, Class.flashCrasher, Class.grouper, Class.megaCrasher, Class.swimmer, Class.visLITE,  Class.dreadnoughtLITE, Class.colliderLITE, Class.gunshipLITE, Class.detraLITE]) : Class.crasher;
            let type = (ran.dice(5)) ? ran.choose([Class.largecrasher, Class.sentryGun, Class.sentrySwarm, Class.sentryTrap]) : Class.crasher;
          let o = new Entity(spot);
                o.define(type);
                o.team = -100;
        }
    };
  
  
    let spawnCrasher = (() => {
       
        const config = {
            max: Math.floor(room["nest"].length * c.CRASHER_RATIO),
            chance: .9,
            sentryChance: 0.95,
            crashers: [Class.crasher],
            sentries: [Class.sentryGun, Class.sentrySwarm, Class.sentryTrap]
        };
        function getType() {
            const seed = Math.random();
            if (seed > config.sentryChance) return ran.choose(config.sentries);
            return ran.choose(config.crashers);
        }
        return census => {
            if (census.crasher < config.max) {
                for (let i = 0; i < config.max - census.crasher; i ++) {
                    if (Math.random() > config.chance) {
                        let spot, i = 25;
                        do {
                            spot = room.randomType('nest');
                            i --;
                            if (!i) return 0;
                        } while (dirtyCheck(spot, 250));
                        let o = new Entity(spot);
                        o.define(getType());
                        o.team = -100;
                    }
                }
            }
        }
    })();
     
    //code added by DogeisCut, made by Max Nest#8441
    let spawnSomething = (() => {
        let timer = 60*1;
        let next = 0;
        return census => {
            if (timer >= 60 * 1) {
              timer = 0;
              let spot = room.center();
              let o = new Entity(spot);
              next++
              switch (next) {
                case 1:
                  o.define(Class.centre);
                  sockets.broadcast("The Centre (Level 1) has spawned!");
                  break;
                case 2:
                  o.define(Class.centre2);
                  sockets.broadcast("The Centre (Level 2) has spawned!");
                  break;
                case 3:
                  o.define(Class.centre3);
                  sockets.broadcast("The Centre (Level 3) has spawned!");
                  break;
                case 4:
                  o.define(Class.centre4);
                  sockets.broadcast("The Centre (Level 4) has spawned!");
                  break;
                case 5:
                  o.define(Class.centre5);
                  sockets.broadcast("The Centre (Level 5) has spawned!");
                  next=0;
                  break;
                default:
                  o.define(Class.arenaCloser);
                  sockets.broadcast("The Centre (Level 1) has spawned!");
                  break;
              }
            } else if (!census.something) timer++;
        };
    })();

    function spawnBot(TEAM = null) {
        let set = ran.choose(botSets);
        let team = TEAM ? TEAM : getTeam();
        const botName = ran.chooseBotName();
        let color = [10, 11, 12, 15][team - 1];
        if (room.gameMode === "ffa") color = (c.RANDOM_COLORS ? Math.floor(Math.random() * 20) : 12);
        let loc = c.SPECIAL_BOSS_SPAWNS ? room.randomType("nest") : room.randomType("norm");
        let o = new Entity(loc);
        o.color = color;
        o.invuln = true;
        o.define(Class[set.startClass]);
        o.name += botName;
        o.refreshBodyAttributes();
        o.color = color;
        if (room.gameMode === "tdm") o.team = -team;
        o.skill.score = 23500;
        o.isBot = true;
        if (c.GROUPS) {
            let master = {
                player: {
                    body: o
                }
            };
            groups.addMember(master);
            o.team = -master.rememberedTeam;
            o.ondead = function() {
                groups.removeMember(master);
            }
        }
        setTimeout(function() {
            if (!o || o.isDead()) return;
            const index = o.index;
            let className = set.startClass;
            for (let key in Class)
                if (Class[key].index === index) className = key;
            o.define(Class[set.ai]);
            o.define(Class[className]);
            o.refreshBodyAttributes();
            o.name += botName;
            o.invuln = false;
            o.skill.set(set.build);
        }, 3000 + (Math.floor(Math.random() * 7000)));
        return o;
    };
    if (c.SPACE_MODE) {
        console.log("Spawned moon.");
        let o = new Entity({
            x: room.width / 2,
            y: room.height / 2
        });
        o.define(Class.moon);
        o.team = -101;
        o.SIZE = room.width / 10;
        o.protect();
        o.life();
        room.blackHoles.push(o);
    }
    // The NPC function
    let makenpcs = (() => {
        // Make base protectors if needed.
        let f = (loc, team) => {
            let o = new Entity(loc);
            o.define(Class.baseProtector);
            o.team = -team;
            o.color = [10, 11, 12, 15][team - 1];
        };
        for (let i = 1; i < 5; i++) {
            room['bap' + i].forEach((loc) => {
                f(loc, i);
            });
        }
        // Return the spawning function
        let bots = [];
        return () => {
            let census = {
                crasher: 0,
                miniboss: 0,
                tank: 0,
                something: 0,
                mothership: 0,
                sanctuary: 0,
            };
            let npcs = entities.map(function npcCensus(instance) {
                if (instance.isSanctuary) {
                    census.sanctuary++;
                    return instance;
                }
                if (census[instance.type] != null) {
                    census[instance.type]++;
                    return instance;
                }
                if (instance.isMothership) {
                    census.mothership++;
                    return instance;
                }
            }).filter(e => {
                return e;
            });
            // Spawning
            //spawnCrasher(census);
            spawnCrasher2(census);
           
            spawnBosses(census);
            //spawnSomething(census);
            //Healing Swarms
            // Bots
            if (bots.length < c.BOTS && !global.arenaClosed) bots.push(spawnBot(global.nextTagBotTeam || null));
            // Remove dead ones
            bots = bots.filter(e => {
                return !e.isDead();
            });
            // Slowly upgrade them
            loopThrough(bots, function(o) {
                if (o.skill.level < 45) {
                    o.skill.score += 2600;
                    o.skill.maintain();
                }
                if (o.upgrades.length && Math.random() > 0.5) o.upgrade(Math.floor(Math.random() * o.upgrades.length));
            });
        };
    })();

 let makefood1 = (() => {
        let food = [], foodSpawners = [];
        // The two essential functions
        function getFoodClass(level) {
            let a = { };
            switch (level) {
               
                case 0: a = Class.egg; break;
                case 1: a = Class.square; break;
                case 2: a = Class.triangle; break;
                case 3: a = Class.pentagon; break;
                case 4: a = Class.bigPentagon; break;
                case 5: a = Class.hugePentagon; break;
            
                default: throw('bad food level');
            }
            if (a !== {}) {
                a.BODY.ACCELERATION = 0.015 / (a.FOOD.LEVEL + 1);
            }
            return a;
        }
   
        let placeNewFood = (position, scatter, level, allowInNest = false) => {
            let o = nearest(food, position); 
            let mitosis = false;
            let seed = false;
            // Find the nearest food and determine if we can do anything with it
            if (o != null) {
                for (let i=50; i>0; i--) {
                    if (scatter == -1 || util.getDistance(position, o) < scatter) {
                        if (ran.dice((o.foodLevel + 1) * (o.foodLevel + 1))) {
                            mitosis = true; break;
                        } else {
                            seed = true; break;
                        }
                    }
                }
            }
            // Decide what to do
            if (scatter != -1 || mitosis || seed) {
                // Splitting
                if (o != null && (mitosis || seed) && room.isIn('nest', o) === allowInNest) {
                    let levelToMake = (mitosis) ? o.foodLevel : level,
                        place = {
                        x: o.x + o.size * Math.cos(o.facing),
                        y: o.y + o.size * Math.sin(o.facing),
                    };
                    let new_o = new Entity(place);
                        new_o.define(getFoodClass(levelToMake));
                       
                        new_o.team = -100;
                    new_o.facing = o.facing + ran.randomRange(Math.PI/2, Math.PI);
                    food.push(new_o);
                    return new_o;
                }
                // Brand new
                else if (room.isIn('nest', position) === allowInNest) {
                    if (!dirtyCheck(position, 20)) {
                        o = new Entity(position);
                            o.define(getFoodClass(level));
                           
                            o.team = -100;
                        o.facing = ran.randomAngle();
                        food.push(o);
                        return o;
                    }
                }
            }
        };
        // Define foodspawners
        class FoodSpawner {
            constructor() {
                this.foodToMake = Math.ceil(Math.abs(ran.gauss(0, room.scale.linear*80)));
                this.size = Math.sqrt(this.foodToMake) * 25;
            
                // Determine where we ought to go
                let position = {}; let o;
                do { 
                    position = room.gaussRing(1/3, 20); 
                    o = placeNewFood(position, this.size, 0);
                } while (o == null);
        
                // Produce a few more
                for (let i=Math.ceil(Math.abs(ran.gauss(0, 4))); i<=0; i--) {
                    placeNewFood(o, this.size, 0);
                }
        
                // Set location
                this.x = o.x;
                this.y = o.y;
                //util.debug('FoodSpawner placed at ('+this.x+', '+this.y+'). Set to produce '+this.foodToMake+' food.');
            }        
            rot() {
                if (--this.foodToMake < 0) {
                    //util.debug('FoodSpawner rotted, respawning.');
                    util.remove(foodSpawners, foodSpawners.indexOf(this));
                    foodSpawners.push(new FoodSpawner());
                }
            }
        }
        // Add them
        foodSpawners.push(new FoodSpawner());
        foodSpawners.push(new FoodSpawner());
        foodSpawners.push(new FoodSpawner());
        foodSpawners.push(new FoodSpawner());
        // Food making functions 
        let makeGroupedFood = () => { // Create grouped food
            // Choose a location around a spawner
            let spawner = foodSpawners[ran.irandom(foodSpawners.length - 1)],
                bubble = ran.gaussRing(spawner.size, 1/4);
            placeNewFood({ x: spawner.x + bubble.x, y: spawner.y + bubble.y, }, -1, 0);
            spawner.rot();
        };
        let makeDistributedFood = () => { // Distribute food everywhere
            //util.debug('Creating new distributed food.');
            let spot = {};
            do { spot = room.gaussRing(1/2, 2); } while (room.isInNorm(spot));
            placeNewFood(spot, 0.01 * room.width, 0);
        };
        let makeCornerFood = () => { // Distribute food in the corners
            let spot = {};
            do { spot = room.gaussInverse(5); } while (room.isInNorm(spot));
            placeNewFood(spot, 0.05 * room.width, 0);
        };
        let makeNestFood = () => { // Make nest pentagons
            let spot = room.randomType('nest');
            placeNewFood(spot, 0.01 * room.width, 3, true);
        };
        // Return the full function
        return () => {
            // Find and understand all food
            let census = {
                [0]: 0, // Egg
                [1]: 0, // Square
                [2]: 0, // Triangle
                [3]: 0, // Penta
                [4]: 0, // Beta
                [5]: 0, // Alpha
                [6]: 0,
                tank: 0,
                sum: 0,
            };
            let censusNest = {
                [0]: 0, // Egg
                [1]: 0, // Square
                [2]: 0, // Triangle
                [3]: 0, // Penta
                [4]: 0, // Beta
                [5]: 0, // Alpha
                [6]: 0,
                sum: 0,
            };
            // Do the censusNest
           food = entities.map(instance => {
                try {
                   if (instance.type === 'tank') {
                       census.tank++;
                   } else if (instance.foodLevel > -1) { 
                       if (room.isIn('nest', { x: instance.x, y: instance.y, })) { censusNest.sum++; censusNest[instance.foodLevel]++; }
                       else { census.sum++; census[instance.foodLevel]++; }
                       return instance;
                   }
               } catch (err) { util.error(instance.label); util.error(err); instance.kill(); }
           }).filter(e => { return e; });     
           // Sum it up   
           let maxFood = 1 + room.maxFood + 15 * census.tank;      
           let maxNestFood = 20 + room.maxFood * room.nestFoodAmount;
           let foodAmount = census.sum;
           let nestFoodAmount = censusNest.sum;
           /*********** ROT OLD SPAWNERS **********/
           foodSpawners.forEach(spawner => { if (ran.chance(1 - foodAmount/maxFood)) spawner.rot(); });
           /************** MAKE FOOD **************/
           while (ran.chance(0.8 * (1 - foodAmount * foodAmount / maxFood / maxFood))) {
               switch (ran.chooseChance(10, 2, 1)) {
               case 0: makeGroupedFood(); break;
               case 1: makeDistributedFood(); break;
               case 2: makeCornerFood(); break;
               }
           } 
           while (ran.chance(0.5 * (1 - nestFoodAmount * nestFoodAmount / maxNestFood / maxNestFood))) makeNestFood();
           /************* UPGRADE FOOD ************/
           if (!food.length) return 0;
           for (let i=Math.ceil(food.length / 100); i>0; i--) {
               let o = food[ran.irandom(food.length - 1)], // A random food instance
                   oldId = -1000,
                   overflow, location;
               // Bounce 6 times
               for (let j=0; j<6; j++) { 
                   overflow = 10;
                   // Find the nearest one that's not the last one
                   do { o = nearest(food, { x: ran.gauss(o.x, 30), y: ran.gauss(o.y, 30), });
                   } while (o.id === oldId && --overflow);        
                   if (!overflow) continue;
                    // Configure for the nest if needed
                   let proportions = c.FOOD,
                       cens = census,
                       
                       amount = foodAmount;
                   if (room.isIn('nest', o)) {
                       proportions = c.FOOD_NEST;
                       cens = censusNest;
                       amount = nestFoodAmount;
                   }
                   // Upgrade stuff
                   o.foodCountup += Math.ceil(Math.abs(ran.gauss(0, 10)));
                   while (o.foodCountup >= (o.foodLevel + 1) * 100) {
                       o.foodCountup -= (o.foodLevel + 1) * 100;
                       if (ran.chance(1 - cens[o.foodLevel + 1] / amount / proportions[o.foodLevel + 1])) {
                           o.define(getFoodClass(o.foodLevel + 1));
                         
                       }
                   }
                }
           }
         };
     })();
         
    // Define food and food spawning
    return () => {
        // Do stuff
       makenpcs();      
//       makefood1(); 
        // Regen health and update the grid
        entities.forEach(instance => {
            if (instance.shield.max) {
                instance.shield.regenerate();
            }
            if (instance.health.amount) {
                instance.health.regenerate(instance.shield.max && instance.shield.max === instance.shield.amount);
            }
        });
    };
})();
const quickmaintainloop = (() => {
function spawnHealerSwarm() {
    for (let i = 0; i < 25; i++){
    let loc = room.randomType("hyou");
    let o = new Entity(loc);
    o.define(Class.healing);
    o.team = -101;
    o.color = 10;//'#3CA4CB77';
    o.alpha = 0.3;
    }
    };
  let makenpcs = (() => {
    return () => {
    spawnHealerSwarm()
    }
  })();
    return () => {
        // Do stuff
        makenpcs();
    };
})();

// Bring it to life
setInterval(gameloop, room.cycleSpeed);

setInterval(maintainloop, 1000);
setInterval(speedcheckloop, 1000);
setInterval(gamemodeLoop, 1000);
setInterval(poisonLoop, room.cycleSpeed * 7);
setInterval(iceLoop, room.cycleSpeed * 7);  
setInterval(quickmaintainloop, room.cycleSpeed*2);