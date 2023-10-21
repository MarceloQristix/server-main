const Lodash= require('lodash');

const CONTRACT_STATUS= require('../const/contractStatus');

module.exports = async function (app, doneCb){
    const Contract= app.locals.models.Contract;
    const Asset= app.locals.models.Asset;

    let summary= {};
    const removeAssetReferenceFromInactiveContracts= async ()=>{
        console.log('About to remove inactive contract references from assets...');

        let inActiveContractsCond= {status: {$in:[CONTRACT_STATUS.CANCELLED, CONTRACT_STATUS.EXPIRED]}};
        let inactiveContractIds= await Contract.distinct('_id', inActiveContractsCond);
        let assetCount=0, contractCount=0;
        for (let id of inactiveContractIds){
            let contract= await Contract.findById(id);
            let assets= await Asset.find({'contract._id': id});
            let staleDataExists= false;
            for (let asset of assets){
                assetCount++;
                staleDataExists= true;
                console.log(`detaching asset ${asset.code}  from inactive contract ${contract.code}`)
                await asset.detachContractAsync(contract.lastModifiedBy||contract.createdBy);
            }
            if (staleDataExists){
                contractCount++;
                summary[contract.code]= Lodash.map(assets, 'code');
            }
        }

        console.log(`Cleared contract information for ${assetCount} assets of ${contractCount} contracts`);
    };

    const addRenewedAndSourceContractReferences= async ()=>{
        let expiredContractIds= await Contract.distinct('_id', {status: {$in:[CONTRACT_STATUS.EXPIRED]}, 'renewedContract._id': {$exists:false}});
        let contractCount= expiredContractIds.length;
        let runningCounter= 0;
        let renewedContractsCount= 0;
        let tobeRenewedContractsCount= 0;
        for (let id of expiredContractIds){
            runningCounter++;
            console.log(`checking ${runningCounter} of ${contractCount}`);
            let contract= await Contract.findById(id);
            let assetIds= Lodash.map(contract.assets, '_id');
            let assetsUnderContract= await Asset.find({'contract._id': {$exists:true}, _id: {$in:assetIds}});
            let assetIdsUnderContract= Lodash.map(assetsUnderContract, '_id');
            let diffIds= Lodash.differenceBy(assetIds, assetIdsUnderContract, (_id)=>{return _id.toString()});
            if (diffIds.length === 0){  //contracts are renewed
                renewedContractsCount++;
                console.log(`Updating renewal info for ${contract.code}`);
                let renewedContractIdsMap= {};
                for (let asset of assetsUnderContract){
                    renewedContractIdsMap[asset.contract._id]= true;
                }
                summary[contract.code]= [];
                let renewedContractIds= Object.keys(renewedContractIdsMap);
                let renewedContract;
                for (let contractId of renewedContractIds){
                    renewedContract= await Contract.findById(contractId);
                    renewedContract.sourceContract= contract.getShortForm();
                    renewedContract.markModified('sourceContract');
                    await renewedContract.save();
                }
                if (renewedContract){
                    contract= await Contract.findById(id);  //potentially the source contract would have got modified in renewedContract
                    contract.renewedContract= renewedContract.getShortForm();
                    contract.markModified('renewedContract');
                    await contract.save();
                    summary[contract.code].push(renewedContract.code);
                }
            }
            else if (diffIds.length >0){    //some assets are still need to be renewed  -- leave them as is for now
                if (diffIds.length < assetIds.length){

                }
            }
        }
        summary.stats= {
            contractCount,
            renewedContractsCount
        }
    };

    const attachActiveContracts2Assets= async ()=>{
        let activeContractIds= await Contract.distinct('_id', {status: {$in:[CONTRACT_STATUS.ACTIVE]}});
        let assetCount=0, contractCount=0;
        for (let id of activeContractIds){
            let contract= await Contract.findById(id);
            let assets= contract.assets;
            let contractLinkageNotFound= false;
            let assetsLinked= [];
            for (let assetInContract of assets){
                let asset= await Asset.findById(assetInContract._id);
                if (asset.contract?._id){
                    continue;
                }
                assetCount++;
                contractLinkageNotFound= true;
                assetsLinked.push(asset.code);
                console.log(`attaching asset ${asset.code}  to active contract ${contract.code}`)
                await asset.attachContractAsync(contract.lastModifiedBy||contract.createdBy, contract);
            }
            if (contractLinkageNotFound){
                contractCount++;
                summary[contract.code]= assetsLinked;
            }
        }
        console.log(`Attached contract information for ${assetCount} assets of ${contractCount} contracts`);
    }


    // await removeAssetReferenceFromInactiveContracts();
    // await addRenewedAndSourceContractReferences();
    await attachActiveContracts2Assets();

    console.log(summary);
    setTimeout(doneCb(), 5);
}
