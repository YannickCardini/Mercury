import type { MarbleColor, Player } from "../types/types.js";

export class Board {

    cheminPlateau = [
        9, 10, 25, 40, 55, 70, 85, 86, 87, 88, 89, 90, 105, 120, 135, 150,
        149, 148, 147, 146, 145, 160, 175, 190, 205, 220, 219, 218, 217, 216,
        201, 186, 171, 156, 141, 140, 139, 138, 137, 136, 121, 106, 91, 76,
        77, 78, 79, 80, 81, 66, 51, 36, 21, 6, 7, 8
    ];

    static redHome = [3, 18, 33, 48];
    static greenHome = [13, 28, 43, 58];
    static blueHome = [178, 193, 208, 223];
    static orangeHome = [168, 183, 198, 213];

    static redStart = 9;
    static greenStart = 135;
    static blueStart = 217;
    static orangeStart = 91;

    static redArrival = [38, 53, 68, 83];
    static greenArrival = [115, 116, 117, 118];
    static blueArrival = [143, 158, 173, 188];
    static orangeArrival = [108, 109, 110, 111];

    static getInitialMarblePositions(color: MarbleColor): number[] {
        switch (color) {
            case 'red':
                return this.redHome;
            case 'green':
                return this.greenHome;
            case 'blue':
                return this.blueHome;
            case 'orange':
                return this.orangeHome;
            default:
                throw new Error(`Invalid color: ${color}`);
        }
    }

    static getArrivalPositions(color: MarbleColor): number[] {
        switch (color) {
            case 'red':
                return this.redArrival;
            case 'green':
                return this.greenArrival;
            case 'blue':
                return this.blueArrival;
            case 'orange':
                return this.orangeArrival;
            default:
                throw new Error(`Invalid color: ${color}`);
        }
    }

    static getStartPosition(color: MarbleColor): number {
        switch (color) {
            case 'red':
                return this.redStart;
            case 'green':
                return this.greenStart;
            case 'blue':
                return this.blueStart;
            case 'orange':
                return this.orangeStart;
            default:
                throw new Error(`Invalid color: ${color}`);
        }
    }



    private haveSameElements(arr1: number[], arr2: number[]): boolean {
        if (arr1.length !== arr2.length) {
            return false;
        }

        // Create sorted copies to avoid modifying original arrays
        const sortedArr1 = [...arr1].sort((a, b) => a - b);
        const sortedArr2 = [...arr2].sort((a, b) => a - b);

        return sortedArr1.every((element, index) => {
            return element === sortedArr2[index];
        });
    }
}