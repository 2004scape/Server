import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import { EntityQueueRequest, ScriptArgument } from '#lostcity/entity/EntityQueueRequest.js';
import Script from '#lostcity/engine/script/Script.js';
import PathingEntity from '#lostcity/entity/PathingEntity.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import NpcType from '#lostcity/cache/NpcType.js';
import { Interaction } from '#lostcity/entity/Interaction.js';
import MoveRestrict from '#lostcity/entity/MoveRestrict.js';
import NpcMode from '#lostcity/entity/NpcMode.js';
import Player from '#lostcity/entity/Player.js';
import { Position } from '#lostcity/entity/Position.js';
import World from '#lostcity/engine/World.js';

export default class Npc extends PathingEntity {
    static ANIM = 0x2;
    static FACE_ENTITY = 0x4;
    static SAY = 0x8;
    static DAMAGE = 0x10;
    static CHANGE_TYPE = 0x20;
    static SPOTANIM = 0x40;
    static FACE_COORD = 0x80;

    // constructor properties
    nid: number;
    type: number;
    origType: number;
    startX: number;
    startZ: number;

    // runtime variables
    static: boolean = true; // static (map) or dynamic (scripted) npc

    mask: number = 0;
    faceX: number = -1;
    faceZ: number = -1;
    faceEntity: number = -1;
    damageTaken: number = -1;
    damageType: number = -1;
    currentHealth: number = 10;
    maxHealth: number = 10;
    animId: number = -1;
    animDelay: number = -1;
    chat: string | null = null;
    graphicId: number = -1;
    graphicHeight: number = -1;
    graphicDelay: number = -1;

    // script variables
    activeScript: ScriptState | null = null;
    delay: number = 0;
    queue: EntityQueueRequest[] = [];
    timerInterval: number = 1;
    timerClock: number = 0;
    mode: NpcMode = NpcMode.NONE;
    interaction: Interaction | null = null;

    constructor(level: number, x: number, z: number, width: number, length: number, nid: number, type: number, moveRestrict: MoveRestrict) {
        super(level, x, z, width, length, moveRestrict);
        this.nid = nid;
        this.type = type;
        this.startX = this.x;
        this.startZ = this.z;
        this.origType = type;

        const npcType = NpcType.get(type);
        if (npcType.timer !== -1) {
            this.setTimer(npcType.timer);
        }
    }

    resetEntity(respawn: boolean) {
        this.resetPathingEntity();

        if (respawn) {
            this.type = this.origType;
            this.despawn = -1;
            this.respawn = -1;
        }

        if (this.mask === 0) {
            return;
        }

        this.mask = 0;
        this.damageTaken = -1;
        this.damageType = -1;
        this.animId = -1;
        this.animDelay = -1;
    }

    updateMovement(running: number = -1): void {
        if (this.tele) {
            this.walkDir = -1;
            this.runDir = -1;
            return;
        }

        if (this.x === this.lastX && this.z === this.lastZ) {
            if (running === -1 && !this.forceMove) {
                running = 0;
            }
            this.processMovement(running);
        }
    }

    delayed() {
        return this.delay > 0;
    }

    setTimer(interval: number) {
        this.timerInterval = interval;
    }

    executeScript(script: ScriptState) {
        if (!script) {
            return;
        }

        const state = ScriptRunner.execute(script);
        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            this.activeScript = script;
        } else if (script === this.activeScript) {
            this.activeScript = null;
        }
    }

    processTimers() {
        if (this.timerInterval !== 0 && ++this.timerClock >= this.timerInterval) {
            this.timerClock = 0;

            const type = NpcType.get(this.type);
            const script = ScriptProvider.getByTrigger(ServerTriggerType.AI_TIMER, type.id, type.category);
            if (script) {
                this.executeScript(ScriptRunner.init(script, this));
            }
        }
    }

    processQueue() {
        let processedQueueCount = 0;

        for (let i = 0; i < this.queue.length; i++) {
            const queue = this.queue[i];

            // purposely only decrements the delay when the npc is not delayed
            if (!this.delayed()) {
                queue.delay--;
            }

            if (!this.delayed() && queue.delay <= 0) {
                const state = ScriptRunner.init(queue.script, this, null, null, queue.args);
                const executionState = ScriptRunner.execute(state);

                if (executionState !== ScriptState.FINISHED && executionState !== ScriptState.ABORTED) {
                    this.activeScript = state;
                }

                processedQueueCount++;
                this.queue.splice(i--, 1);
            }
        }

        return processedQueueCount;
    }

    enqueueScript(script: Script, delay = 0, args: ScriptArgument[] = []) {
        const request = new EntityQueueRequest('npc', script, args, delay + 1);
        this.queue.push(request);
    }

    randomWalk(range: number) {
        const dx = Math.round((Math.random() * (range * 2)) - range);
        const dz = Math.round((Math.random() * (range * 2)) - range);
        const destX = this.startX + dx;
        const destZ = this.startZ + dz;

        if (destX !== this.x || destZ !== this.z) {
            this.queueWalkStep(destX, destZ);
        }
    }

    processNpcModes() {
        switch (this.mode) {
            case NpcMode.NONE:
                this.noMode();
                break;
            case NpcMode.WANDER:
                this.wanderMode();
                break;
            case NpcMode.PATROL:
                this.patrolMode();
                break;
            case NpcMode.PLAYERESCAPE:
                this.playerEscapeMode();
                break;
            case NpcMode.PLAYERFOLLOW:
                this.playerFollowMode();
                break;
            case NpcMode.PLAYERFACE:
                this.playerFaceMode();
                break;
            case NpcMode.PLAYERFACECLOSE:
                this.playerFaceCloseMode();
                break;
            default:
                this.aiMode();
                break;
        }
        this.updateMovement();
    }

    noMode(): void {
        const type = NpcType.get(this.type);
        this.mode = type.defaultmode;
        this.interaction = null;
        this.faceEntity = 0;
        this.mask |= Player.FACE_ENTITY;
    }

    wanderMode(): void {
        const type = NpcType.get(this.type);
        if (type.moverestrict !== MoveRestrict.NOMOVE && Math.random() < 0.125) {
            this.randomWalk(type.wanderrange);
        }
    }

    patrolMode(): void {
        // TODO points
    }

    playerEscapeMode(): void {
        if (!this.static) {
            World.removeNpc(this);
        }
    }

    playerFollowMode(): void {
        if (this.interaction) {
            const target = this.interaction.target as Player;

            const path = World.pathFinder.naiveDestination(this.x, this.z, this.width, this.length, target.x, target.z, target.width, target.length);
            this.queueWalkStep(path.x, path.z);

            this.faceEntity = target.pid + 32768;
            this.mask |= Player.FACE_ENTITY;
        }
    }

    playerFaceMode(): void {
        if (this.interaction) {
            const target = this.interaction.target as Player;
            const type = NpcType.get(this.type);

            if (Position.distanceTo(this, target) <= type.maxrange) {
                this.faceEntity = target.pid + 32768;
            } else {
                this.mode = NpcMode.NONE;
                this.interaction = null;
                this.faceEntity = 0;
            }

            this.mask |= Player.FACE_ENTITY;
        }
    }

    playerFaceCloseMode(): void {
        if (this.interaction) {
            const target = this.interaction.target as Player;

            if (Position.distanceTo(this, target) <= 1) {
                this.faceEntity = target.pid + 32768;
            } else {
                this.mode = NpcMode.NONE;
                this.interaction = null;
                this.faceEntity = 0;
            }

            this.mask |= Player.FACE_ENTITY;
        }
    }

    aiMode(): void {
        if (this.delayed()) {
            return;
        }

        if (this.interaction) {
            const target = this.interaction.target as Player;

            // TODO check for the actual retreat number
            if (Position.distanceTo(this, target) > 14) {
                this.playerEscapeMode();
                return;
            }

            // TODO check for ap?
            if (Position.distanceTo(this, target) > 1) {
                this.playerFollowMode();
                return;
            }

            const trigger = this.getTriggerForMode();
            if (trigger) {
                const script = ScriptProvider.getByTrigger(trigger, this.type, -1);

                this.faceEntity = target.pid + 32768;
                this.mask |= Player.FACE_ENTITY;

                if (script) {
                    World.enqueueScript(ScriptRunner.init(script, this, this.interaction.target, null, []));
                }
            }
        }
    }

    getTriggerForMode(): ServerTriggerType | null {
        switch (this.mode) {
            // [ai_opplayerX,npc]
            case NpcMode.OPPLAYER1:
                return ServerTriggerType.AI_OPPLAYER1;
            case NpcMode.OPPLAYER2:
                return ServerTriggerType.AI_OPPLAYER2;
            case NpcMode.OPPLAYER3:
                return ServerTriggerType.AI_OPPLAYER3;
            case NpcMode.OPPLAYER4:
                return ServerTriggerType.AI_OPPLAYER4;
            case NpcMode.OPPLAYER5:
                return ServerTriggerType.AI_OPPLAYER5;
            // [ai_applayerX,npc]
            case NpcMode.APPLAYER1:
                return ServerTriggerType.AI_APPLAYER1;
            case NpcMode.APPLAYER2:
                return ServerTriggerType.AI_APPLAYER2;
            case NpcMode.APPLAYER3:
                return ServerTriggerType.AI_APPLAYER3;
            case NpcMode.APPLAYER4:
                return ServerTriggerType.AI_APPLAYER4;
            case NpcMode.APPLAYER5:
                return ServerTriggerType.AI_APPLAYER5;
            // [ai_oplocX,npc]
            case NpcMode.OPLOC1:
                return ServerTriggerType.AI_OPLOC1;
            case NpcMode.OPLOC2:
                return ServerTriggerType.AI_OPLOC2;
            case NpcMode.OPLOC3:
                return ServerTriggerType.AI_OPLOC3;
            case NpcMode.OPLOC4:
                return ServerTriggerType.AI_OPLOC4;
            case NpcMode.OPLOC5:
                return ServerTriggerType.AI_OPLOC5;
            // [ai_aplocX,npc]
            case NpcMode.APLOC1:
                return ServerTriggerType.AI_APLOC1;
            case NpcMode.APLOC2:
                return ServerTriggerType.AI_APLOC2;
            case NpcMode.APLOC3:
                return ServerTriggerType.AI_APLOC3;
            case NpcMode.APLOC4:
                return ServerTriggerType.AI_APLOC4;
            case NpcMode.APLOC5:
                return ServerTriggerType.AI_APLOC5;
            // [ai_opobjX,npc]
            case NpcMode.OPOBJ1:
                return ServerTriggerType.AI_OPOBJ1;
            case NpcMode.OPOBJ2:
                return ServerTriggerType.AI_OPOBJ2;
            case NpcMode.OPOBJ3:
                return ServerTriggerType.AI_OPOBJ3;
            case NpcMode.OPOBJ4:
                return ServerTriggerType.AI_OPOBJ4;
            case NpcMode.OPOBJ5:
                return ServerTriggerType.AI_OPOBJ5;
            // [ai_apobjX,npc]
            case NpcMode.APOBJ1:
                return ServerTriggerType.AI_APOBJ1;
            case NpcMode.APOBJ2:
                return ServerTriggerType.AI_APOBJ2;
            case NpcMode.APOBJ3:
                return ServerTriggerType.AI_APOBJ3;
            case NpcMode.APOBJ4:
                return ServerTriggerType.AI_APOBJ4;
            case NpcMode.APOBJ5:
                return ServerTriggerType.AI_APOBJ5;
            // [ai_opnpcX,npc]
            case NpcMode.OPNPC1:
                return ServerTriggerType.AI_OPNPC1;
            case NpcMode.OPNPC2:
                return ServerTriggerType.AI_OPNPC2;
            case NpcMode.OPNPC3:
                return ServerTriggerType.AI_OPNPC3;
            case NpcMode.OPNPC4:
                return ServerTriggerType.AI_OPNPC4;
            case NpcMode.OPNPC5:
                return ServerTriggerType.AI_OPNPC5;
            // [ai_apnpcX,npc]
            case NpcMode.APNPC1:
                return ServerTriggerType.AI_APNPC1;
            case NpcMode.APNPC2:
                return ServerTriggerType.AI_APNPC2;
            case NpcMode.APNPC3:
                return ServerTriggerType.AI_APNPC3;
            case NpcMode.APNPC4:
                return ServerTriggerType.AI_APNPC4;
            case NpcMode.APNPC5:
                return ServerTriggerType.AI_APNPC5;
            default:
                return null;
        }
    }

    // ----

    playAnimation(seq: number, delay: number) {
        this.animId = seq;
        this.animDelay = delay;
        this.mask |= Npc.ANIM;
    }

    spotanim(spotanim: number, height: number, delay: number) {
        this.graphicId = spotanim;
        this.graphicHeight = height;
        this.graphicDelay = delay;
        this.mask |= Npc.SPOTANIM;
    }

    applyDamage(damage: number, type: number) {
        this.damageTaken = damage;
        this.damageType = type;

        this.currentHealth -= damage;
        if (this.currentHealth < 0) {
            this.currentHealth = 0;
        }

        this.mask |= Npc.DAMAGE;
    }

    say(text: string) {
        if (!text) {
            return;
        }

        this.chat = text;
        this.mask |= Npc.SAY;
    }

    faceSquare(x: number, z: number) {
        this.faceX = x * 2 + 1;
        this.faceZ = z * 2 + 1;
        this.mask |= Npc.FACE_COORD;
    }

    changeType(id: number) {
        this.type = id;
        this.mask |= Npc.CHANGE_TYPE;
    }
}
