
const fse = require('fs-extra');
const path = require('path');

async function sync(config, state = undefined)
{
    if(!config.source || !config.destination)
        throw "Source and destination must be defined";

    let sdir = path.normalize(config.source);
    let tdir = path.normalize(config.destination);

    fse.accessSync(sdir, fse.constants.R_OK)
    fse.accessSync(tdir, fse.constants.R_OK | fse.constants.W_OK)

    let toCheck = (await syncLevel(config, sdir, tdir)).filter(e => e.state === 'TO_CHECK');

    for(tc of toCheck) {
        await sync({...config, source: `${sdir}/${tc.value}`, destination: `${tdir}/${tc.value}`})
    }
}


async function syncLevel(config, level_s, level_t)
{
    let state = []

    let del = true; // delete from target if not in source.
    let create = true; // creats in target if in source.
    let replace = true; // replaces files in target with files in source.
    let sourceFilter = () => true;

    if(config.delete_in_target && ["boolean", "function"].includes(typeof(config.delete_in_target)))
        del = config.delete_in_target;

    if(config.create_in_target && ["boolean", "function"].includes(typeof(config.create_in_target)))
        create = config.create_in_target;

    if(config.replace_in_target && ["boolean", "function"].includes(typeof(config.replace_in_target)))
        replace = config.replace_in_target;

    if(config.filter_in_source && typeof(config.filter_in_source) === 'function')
        sourceFilter = config.filter_in_source;

    let sourceFiles = new Set(fse.readdirSync(level_s).filter(e => sourceFilter(path.normalize(`${level_s}/${e}`))));
    let targetFiles = new Set(fse.readdirSync(level_t));

    for (const f of targetFiles) {
        if(!sourceFiles.has(f))
        {
            let p = path.normalize(`${level_t}/${f}`);

            if(typeof del === 'boolean' ? del : del(p))
            {
                await fse.remove(p);
                state.push({state: 'DELETED', value: p});
            }
        }
        else
        {
            let pT = path.normalize(`${level_t}/${f}`);
            let pS = path.normalize(`${level_s}/${f}`);

            const lstatT = await fse.lstat(pT);
            const lstatS = await fse.lstat(pS);

            // there might be egde case here..
            if(lstatT.isDirectory())
            {
                state.push({state: 'TO_CHECK', value: f});
            }
            else
            {
                if(typeof replace === 'boolean' ? replace : replace(pT, pS, lstatT, lstatS))
                {
                    await fse.copy(pS, pT);
                    state.push({state:"REPLACED", value:pT})
                }
            }
        }
    }

    for (const f of sourceFiles) {
        if(!targetFiles.has(f))
        {
            let pS = path.normalize(`${level_s}/${f}`);

            let statS = await fse.lstat(pS);

            let pT = path.normalize(`${level_t}/${f}`);

            if(typeof create === 'boolean' ? create : create(pT))
            {
                if(statS.isDirectory())
                {
                    await fse.ensureDir(pT);
                    state.push({state: 'TO_CHECK', value: f})
                }
                else
                {
                    await fse.copy(pS, pT);
                    state.push({state: 'CREATED', value: pT})
                }
            }
        }
    }

    return state;
}


if(require.main === module)
{
    let file = 'config.js';

    if(process.argv.length === 3)
       file = process.argv[2];

    let cfg = JSON.stringify(fse.readFileSync(file));

    sync(cfg).catch(console.error)
}
else
{
    module.exports = {
        sync
    }
}
