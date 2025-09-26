import { Point } from './types';

export class DBSCAN {
    private points: Point[];
    private eps: number;
    private minPts: number;
    private visited: boolean[];
    private clusters: number[];

    constructor(points: Point[], eps: number, minPts: number) {
        this.points = points;
        this.eps = eps;
        this.minPts = minPts;
        this.visited = new Array(points.length).fill(false);
        this.clusters = new Array(points.length).fill(-1);
    }

    public run(): number[][] {
        let clusterId = 0;

        for (let i = 0; i < this.points.length; i++) {
            if (this.visited[i]) continue;

            this.visited[i] = true;
            const neighbors = this.regionQuery(i);

            if (neighbors.length < this.minPts) {
                this.clusters[i] = -1; // Mark as noise
            } else {
                this.expandCluster(i, neighbors, clusterId);
                clusterId++;
            }
        }

        return this.getClusters(clusterId);
    }

    private regionQuery(pointIndex: number): number[] {
        const neighbors: number[] = [];

        for (let i = 0; i < this.points.length; i++) {
            if (this.distance(this.points[pointIndex], this.points[i]) <= this.eps) {
                neighbors.push(i);
            }
        }

        return neighbors;
    }

    private expandCluster(pointIndex: number, neighbors: number[], clusterId: number): void {
        this.clusters[pointIndex] = clusterId;

        for (let i = 0; i < neighbors.length; i++) {
            const neighborIndex = neighbors[i];

            if (!this.visited[neighborIndex]) {
                this.visited[neighborIndex] = true;
                const newNeighbors = this.regionQuery(neighborIndex);

                if (newNeighbors.length >= this.minPts) {
                    neighbors = neighbors.concat(newNeighbors);
                }
            }

            if (this.clusters[neighborIndex] === -1) {
                this.clusters[neighborIndex] = clusterId; // Change noise to border point
            }
        }
    }

    private distance(pointA: Point, pointB: Point): number {
        return Math.sqrt(Math.pow(pointA.latitude - pointB.latitude, 2) + Math.pow(pointA.longitude - pointB.longitude, 2));
    }

    private getClusters(clusterId: number): number[][] {
        const clusters: number[][] = Array.from({ length: clusterId }, () => []);

        for (let i = 0; i < this.clusters.length; i++) {
            if (this.clusters[i] !== -1) {
                clusters[this.clusters[i]].push(i);
            }
        }

        return clusters;
    }
}