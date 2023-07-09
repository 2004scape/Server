import Script from "#lostcity/engine/Script";

export type QueueType = 'weak' | 'normal' | 'strong' | 'npc' | null;
export type ScriptArgument = number | string;

export class EntityQueueRequest {
    /**
     * The type of queue request.
     */
    type: QueueType;

    /**
     * The script to execute.
     */
    script: Script | null;

    /**
     * The arguments to execute the script with.
     */
    args: ScriptArgument[] | null;

    /**
     * The number of ticks remaining until the queue executes.
     */
    delay: number;

    constructor(type: QueueType, script: Script | null, args: ScriptArgument[] | null, delay: number) {
        this.type = type;
        this.script = script;
        this.args = args;
        this.delay = delay;
    }
}
