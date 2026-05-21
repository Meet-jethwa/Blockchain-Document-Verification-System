import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();
  const documentRegistry = await ethers.deployContract("DocumentRegistry");

  await documentRegistry.waitForDeployment();
  const address = await documentRegistry.getAddress();
  const deployTx = documentRegistry.deploymentTransaction();

  console.log("DocumentRegistry deployed to:", address);
  if (deployTx) {
    console.log("Deployment tx:", deployTx.hash);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
