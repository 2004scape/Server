import ScriptOpcode from '#lostcity/engine/script/ScriptOpcode.js';
import path from 'path';
import Packet from '#jagex2/io/Packet.js';

export interface ScriptInfo {
    scriptName: string,
    sourceFilePath: string,
    lookupKey: number,
    parameterTypes: number[],
    pcs: number[],
    lines: number[]
}

export type SwitchTable = {
    [key: number]: number | undefined
}

// compiled bytecode representation
export default class Script {
    info: ScriptInfo = {
        scriptName: '<unknown>',
        sourceFilePath: '<unknown>',
        lookupKey: -1,
        parameterTypes: [],
        pcs: [],
        lines: []
    };

    intLocalCount = 0;
    stringLocalCount = 0;
    intArgCount = 0;
    stringArgCount = 0;
    switchTables: SwitchTable[] = [];
    opcodes: number[] = [];
    intOperands: number[] = [];
    stringOperands: string[] = [];

    // decodes the same binary format as clientscript2
    static decode(stream: Packet): Script {
        if (stream.length < 16) {
            throw new Error('Invalid script file (minimum length)');
        }

        stream.pos = stream.length - 2;

        const trailerLen = stream.g2();
        const trailerPos = stream.length - trailerLen - 12 - 2;

        if (trailerPos < 0 || trailerPos >= stream.length) {
            throw new Error('Invalid script file (bad trailer pos)');
        }

        stream.pos = trailerPos;

        const script = new Script();
        const _instructions = stream.g4(); // we don't need to preallocate anything in JS, but still need to read it
        script.intLocalCount = stream.g2();
        script.stringLocalCount = stream.g2();
        script.intArgCount = stream.g2();
        script.stringArgCount = stream.g2();

        const switches = stream.g1();
        for (let i = 0; i < switches; i++) {
            const count = stream.g2();
            const table: SwitchTable = [];

            for (let j = 0; j < count; j++) {
                const key = stream.g4();
                const offset = stream.g4s();
                table[key] = offset;
            }

            script.switchTables[i] = table;
        }

        stream.pos = 0;
        script.info.scriptName = stream.gjnstr();
        script.info.sourceFilePath = stream.gjnstr();
        script.info.lookupKey = stream.g4();
        const parameterTypeCount = stream.g1();
        for (let i = 0; i < parameterTypeCount; i++) {
            script.info.parameterTypes.push(stream.g1());
        }

        const lineNumberTableLength = stream.g2();
        for (let i = 0; i < lineNumberTableLength; i++) {
            script.info.pcs.push(stream.g4());
            script.info.lines.push(stream.g4());
        }

        let instr = 0;
        while (trailerPos > stream.pos) {
            const opcode = stream.g2();

            if (opcode === ScriptOpcode.PUSH_CONSTANT_STRING) {
                script.stringOperands[instr] = stream.gjnstr();
            } else if (opcode < 100 && opcode !== ScriptOpcode.RETURN && opcode !== ScriptOpcode.POP_INT_DISCARD && opcode !== ScriptOpcode.POP_STRING_DISCARD) {
                script.intOperands[instr] = stream.g4s();
            } else {
                script.intOperands[instr] = stream.g1();
            }

            script.opcodes[instr++] = opcode;
        }

        return script;
    }

    get name() {
        return this.info.scriptName;
    }

    get fileName() {
        return path.basename(this.info.sourceFilePath);
    }

    lineNumber(pc: number) {
        for (let i = 0; i < this.info.pcs.length; i++) {
            if (this.info.pcs[i] > pc) {
                return this.info.lines[i - 1];
            }
        }

        return this.info.lines[this.info.lines.length - 1];
    }
}
