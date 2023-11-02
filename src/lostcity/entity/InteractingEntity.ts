import PathingEntity from '#lostcity/entity/PathingEntity.js';
import {Interaction} from '#lostcity/entity/Interaction.js';
import ScriptState from '#lostcity/engine/script/ScriptState.js';
import Player from '#lostcity/entity/Player.js';
import World from '#lostcity/engine/World.js';
import Npc from '#lostcity/entity/Npc.js';
import Loc from '#lostcity/entity/Loc.js';
import Script from '#lostcity/engine/script/Script.js';
import ScriptRunner from '#lostcity/engine/script/ScriptRunner.js';
import Obj from '#lostcity/entity/Obj.js';
import NpcType from '#lostcity/cache/NpcType.js';
import LocType from '#lostcity/cache/LocType.js';
import ObjType from '#lostcity/cache/ObjType.js';
import ScriptProvider from '#lostcity/engine/script/ScriptProvider.js';
import ServerTriggerType from '#lostcity/engine/script/ServerTriggerType.js';
import Entity from '#lostcity/entity/Entity.js';
import NpcMode from '#lostcity/entity/NpcMode.js';

export default abstract class InteractingEntity extends PathingEntity {
    interaction: Interaction | null = null;
    lastMovement: number = 0; // for p_arrivedelay
    delay: number = 0;
    activeScript: ScriptState | null = null;

    faceX: number = -1;
    faceZ: number = -1;

    abstract busy(): boolean;
    abstract onTryMoveInteraction(interaction: Interaction | null, interacted: boolean): void;
    abstract onFailedInteraction(interaction: Interaction | null): void;
    abstract onSuccessfulInteraction(interaction: Interaction | null): void;
    abstract onScriptExecution(): void;
    abstract onScriptFailedExecution(interaction: Interaction | null): void;
    abstract onFailedSetInteraction(): void;
    abstract onSetInteraction(target: Entity): void;

    delayed(): boolean {
        return this.delay > 0;
    }

    setInteraction(mode: ServerTriggerType | NpcMode, target: Player | Npc | Loc | Obj) {
        if (this.forceMove || this.delayed()) {
            this.onFailedSetInteraction();
            return;
        }

        this.interaction = {
            mode,
            target,
            x: target.x,
            z: target.z,
            ap: true, // true so we check for existence of ap script first
            apRange: 10,
            apRangeCalled: false,
        };

        this.onSetInteraction(target);
        if (!this.getInteractionScript(this.interaction) || this.inOperableDistance(target)) {
            this.interaction.ap = false;
        }
    }

    protected processInteraction() {
        // check if the target currently exists, if not clear the interaction
        if (this.interaction) {
            const target = this.interaction.target;
            if (target instanceof Player) {
                if (World.getPlayer(target.pid) == null) {
                    this.resetInteraction();
                    return;
                }
            } else if (target instanceof Npc) {
                const npc = World.getNpc(target.nid);
                if (npc == null || npc.delayed() || npc.despawn !== -1 || npc.respawn !== -1) {
                    this.resetInteraction();
                    return;
                }
            } else if (target instanceof Loc) {
                const loc = World.getLoc(target.x, target.z, target.level, target.type);
                if (loc == null) {
                    this.resetInteraction();
                    return;
                }
            } else {
                const obj = World.getObj(target.x, target.z, target.level, target.type);
                if (obj == null) {
                    this.resetInteraction();
                    return;
                }
            }
        }

        if (!this.interaction) {
            // skip the full interaction logic and just process movement
            this.updateMovement();
            return;
        }

        const interaction = this.interaction;
        interaction.apRangeCalled = false;

        const {ap, op} = this.getInteractionScript(interaction);

        const target = interaction.target;
        let interacted = false;

        const approach = this.interaction.ap;

        if (!this.busy()) {
            if (op !== null && !interaction.ap && this.inOperableDistance(target) && (target instanceof Player || target instanceof Npc)) {
                this.executeInteraction(op, interaction);
                interacted = true;
            } else if (ap !== null && interaction.ap && this.inApproachDistance(target, interaction.apRange)) {
                this.executeInteraction(ap, interaction);
                interacted = true;
            }
        }

        const scriptSwitched = !(interacted && approach === this.interaction?.ap);
        if (this instanceof Player) {
            this.onTryMoveInteraction(this.interaction, interacted && !scriptSwitched);
        } else {
            this.onTryMoveInteraction(this.interaction, interacted);
        }

        const moved = this.lastX !== this.x || this.lastZ !== this.z;
        if (moved) {
            this.lastMovement = World.currentTick + 1;
        }

        if (!this.busy()) {
            if (!interacted || interaction.apRangeCalled) {
                if (op !== null && !interaction.ap && this.inOperableDistance(target) && ((target instanceof Player || target instanceof Npc) || !moved)) {
                    this.executeInteraction(op, interaction);
                    interacted = true;
                } else if (ap !== null && interaction.ap && this.inApproachDistance(target, interaction.apRange)) {
                    this.executeInteraction(ap, interaction);
                    interacted = true;
                }
            }
        }

        if (!this.delayed()) {
            if (!interacted && !moved && !this.hasSteps()) {
                this.onFailedInteraction(this.interaction);
            }
            if (interacted && !interaction.apRangeCalled) {
                this.onSuccessfulInteraction(this.interaction);
                if (this.interaction === interaction) {
                    this.resetInteraction();
                    this.clearWalkSteps();
                }
            }
        }
    }

    protected executeInteraction(script: Script, interaction: Interaction): void {
        if (interaction === null) {
            return;
        }
        const state = ScriptRunner.init(script, this, interaction.target);
        this.executeScript(state);
        if (state.execution !== ScriptState.FINISHED && state.execution !== ScriptState.ABORTED) {
            this.resetInteraction();
        }
    }

    protected resetInteraction(): void {
        this.interaction = null;
    }

    protected executeScript(script: ScriptState): void {
        if (!script) {
            this.onScriptFailedExecution(this.interaction);
            return;
        }
        const state = ScriptRunner.execute(script);
        if (state !== ScriptState.FINISHED && state !== ScriptState.ABORTED) {
            this.activeScript = script;
        } else if (script === this.activeScript) {
            this.activeScript = null;
            this.onScriptExecution();
        }
    }

    getInteractionScript(interaction: Interaction) {
        let typeId = -1;
        let categoryId = -1;
        if (interaction.target instanceof Npc || interaction.target instanceof Loc || interaction.target instanceof Obj) {
            const type = interaction.target instanceof Npc ? NpcType.get(interaction.target.type) : interaction.target instanceof Loc ? LocType.get(interaction.target.type) : ObjType.get(interaction.target.type);
            typeId = type.id;
            categoryId = type.category;
        }

        let ap: Script | null;
        let op: Script | null;

        ap = ScriptProvider.getByTrigger(interaction.mode, typeId, categoryId) ?? null;
        op = ScriptProvider.getByTrigger(interaction.mode + 7, typeId, categoryId) ?? null;

        if (!ap && !op && typeId !== -1 && categoryId !== -1) {
            ap = ScriptProvider.getByTrigger(interaction.mode, -1, categoryId) ?? null;
            op = ScriptProvider.getByTrigger(interaction.mode + 7, -1, categoryId) ?? null;
        }

        if (!ap && !op && typeId !== -1 && categoryId !== -1) {
            ap = ScriptProvider.getByTrigger(interaction.mode, -1, -1) ?? null;
            op = ScriptProvider.getByTrigger(interaction.mode + 7, -1, -1) ?? null;
        }

        return {ap, op};
    }
}