"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const promises_1 = require("timers/promises");
const p_series_1 = __importDefault(require("p-series"));
function listDeployments(client, { owner, repo, environment, ref = '' }, page = 0) {
    return __awaiter(this, void 0, void 0, function* () {
        core.debug(`Getting list of deployments in environment ${environment}`);
        const { data } = yield client.request('GET /repos/{owner}/{repo}/deployments', {
            owner,
            repo,
            environment,
            ref,
            per_page: 100,
            page,
        });
        const deploymentRefs = data.map((deployment) => ({
            deploymentId: deployment.id,
            ref: deployment.ref,
        }));
        core.debug(`Getting total of ${deploymentRefs.length} deployments on page ${page} `);
        if (deploymentRefs.length === 100)
            return deploymentRefs.concat(yield listDeployments(client, { owner, repo, environment, ref }, page + 1));
        return deploymentRefs;
    });
}
function setDeploymentInactive(client, { owner, repo, deploymentId }, delay = 100) {
    return __awaiter(this, void 0, void 0, function* () {
        core.info(`deactivating deployment ${deploymentId}`);
        yield client.request('POST /repos/{owner}/{repo}/deployments/{deployment_id}/statuses', {
            owner,
            repo,
            deployment_id: deploymentId,
            state: 'inactive',
        });
        yield (0, promises_1.setTimeout)(delay);
        core.info(`deleting deployment ${deploymentId}`);
        yield client.request('DELETE /repos/{owner}/{repo}/deployments/{deployment_id}', {
            owner,
            repo,
            deployment_id: deploymentId,
        });
        yield (0, promises_1.setTimeout)(delay);
    });
}
function deleteDeploymentById(client, { owner, repo, deploymentId }, delay = 100) {
    return __awaiter(this, void 0, void 0, function* () {
        core.info(`deleting deployment ${deploymentId}`);
        yield client.request('DELETE /repos/{owner}/{repo}/deployments/{deployment_id}', {
            owner,
            repo,
            deployment_id: deploymentId,
        });
        yield (0, promises_1.setTimeout)(delay);
    });
}
function deleteTheEnvironment(client, environment, { owner, repo }) {
    return __awaiter(this, void 0, void 0, function* () {
        let existingEnv = false;
        try {
            const getEnvResult = yield client.request('GET /repos/{owner}/{repo}/environments/{environment_name}', {
                owner,
                repo,
                environment_name: environment,
            });
            existingEnv = typeof getEnvResult === 'object';
        }
        catch (err) {
            if (err.status !== 404) {
                core.error('Error deleting environment');
                throw err;
            }
        }
        if (existingEnv) {
            core.info(`deleting environment ${environment}`);
            yield client.request('DELETE /repos/{owner}/{repo}/environments/{environment_name}', {
                owner,
                repo,
                environment_name: environment,
            });
            core.info(`environment ${environment} deleted`);
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        let deleteDeployment = true;
        let deleteEnvironment = true;
        const { context } = github;
        const token = core.getInput('token', { required: true });
        const environment = core.getInput('environment', { required: true });
        const onlyRemoveDeployments = core.getInput('onlyRemoveDeployments', {
            required: false,
        });
        const onlyDeactivateDeployments = core.getInput('onlyDeactivateDeployments', {
            required: false,
        });
        const ref = core.getInput('ref', { required: false });
        core.debug(`Starting Deployment Deletion action`);
        const client = github.getOctokit(token, {
            throttle: {
                onRateLimit: (retryAfter = 0, options) => {
                    console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
                    if (options.request.retryCount === 0) {
                        // only retries once
                        console.log(`Retrying after ${retryAfter} seconds!`);
                        return true;
                    }
                },
                onAbuseLimit: (retryAfter = 0, options) => {
                    console.warn(`Abuse detected for request ${options.method} ${options.url}`);
                    if (options.request.retryCount === 0) {
                        // only retries once
                        console.log(`Retrying after ${retryAfter} seconds!`);
                        return true;
                    }
                },
            },
            previews: ['ant-man'],
        });
        if (onlyDeactivateDeployments === 'true') {
            deleteDeployment = false;
            deleteEnvironment = false;
        }
        else if (onlyRemoveDeployments === 'true') {
            deleteEnvironment = false;
        }
        core.debug(`Try to list deployments`);
        try {
            const deploymentRefs = yield listDeployments(client, Object.assign(Object.assign({}, context.repo), { environment,
                ref }));
            core.info(`Found ${deploymentRefs.length} deployments`);
            let deploymentIds;
            let deleteDeploymentMessage;
            let deactivateDeploymentMessage;
            if (ref.length > 0) {
                deleteDeploymentMessage = `deleting deployment ref ${ref} in environment ${environment}`;
                deactivateDeploymentMessage = `deactivating deployment ref ${ref} in environment ${environment}`;
                deploymentIds = deploymentRefs
                    .filter((deployment) => deployment.ref === ref)
                    .map((deployment) => deployment.deploymentId);
            }
            else {
                deleteDeploymentMessage = `deleting all ${deploymentRefs.length} deployments in environment ${environment}`;
                deactivateDeploymentMessage = `deactivating all ${deploymentRefs.length} deployments in environment ${environment}`;
                deploymentIds = deploymentRefs.map((deployment) => deployment.deploymentId);
            }
            core.info(deactivateDeploymentMessage);
            yield (0, p_series_1.default)(deploymentIds.map((deploymentId) => () => setDeploymentInactive(client, Object.assign(Object.assign({}, context.repo), { deploymentId }))));
            // if (deleteDeployment) {
            //   core.info(deleteDeploymentMessage);
            //   await pSeries(
            //     deploymentIds.map(
            //       (deploymentId) => () =>
            //         deleteDeploymentById(client, { ...context.repo, deploymentId }),
            //     ),
            //   );
            // }
            // if (deleteEnvironment) {
            //   await deleteTheEnvironment(client, environment, context.repo);
            // }
            core.info('done');
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
exports.main = main;
//# sourceMappingURL=execute.js.map