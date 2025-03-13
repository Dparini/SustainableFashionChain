const { expect } = require('chai');
const sinon = require('sinon');
const { Context } = require('fabric-contract-api');
const { ChaincodeStub } = require('fabric-shim');
const SupplyChainContract = require('../index');

describe('SupplyChainContract', () => {
  let contract;
  let ctx;
  let stub;

  beforeEach(() => {
    contract = new SupplyChainContract();
    ctx = sinon.createStubInstance(Context);
    stub = sinon.createStubInstance(ChaincodeStub);
    ctx.stub = stub;
  });

  describe('registerProduct', () => {
    it('should register a new product correctly', async () => {
      const id = 'PROD001';
      const type = 'cotton';
      const origin = 'Farm A';
      const timestamp = '1626937200000';
      const certifications = '[]';
      const metadata = '{"quality":"premium"}';

      // Mock the putState method
      stub.putState.resolves(Buffer.from(''));

      // Call the function
      const result = await contract.registerProduct(ctx, id, type, origin, timestamp, certifications, metadata);

      // Parse the result to an object
      const resultObj = JSON.parse(result);

      // Verify the result
      expect(resultObj).to.have.property('id').that.equals(id);
      expect(resultObj).to.have.property('type').that.equals(type);
      expect(resultObj).to.have.property('origin').that.equals(origin);
      expect(resultObj).to.have.property('status').that.equals('REGISTERED');
      expect(resultObj).to.have.property('custodyHistory').that.is.an('array').with.lengthOf(1);
      expect(resultObj.custodyHistory[0]).to.have.property('holder').that.equals(origin);

      // Verify that putState was called with the correct arguments
      sinon.assert.calledWith(stub.putState, id, sinon.match.any);
    });
  });

  describe('transferCustody', () => {
    it('should transfer custody of a product correctly', async () => {
      const id = 'PROD001';
      const newHolder = 'Manufacturer B';
      const timestamp = '1626950800000';
      const location = 'Factory 2';

      // Mock the getState method to return a product
      const product = {
        id,
        type: 'cotton',
        origin: 'Farm A',
        status: 'REGISTERED',
        custodyHistory: [
          {
            holder: 'Farm A',
            timestamp: '1626937200000'
          }
        ]
      };
      stub.getState.resolves(Buffer.from(JSON.stringify(product)));
      stub.putState.resolves(Buffer.from(''));

      // Call the function
      const result = await contract.transferCustody(ctx, id, newHolder, timestamp, location);

      // Parse the result to an object
      const resultObj = JSON.parse(result);

      // Verify the result
      expect(resultObj.custodyHistory).to.have.lengthOf(2);
      expect(resultObj.custodyHistory[1].holder).to.equal(newHolder);
      expect(resultObj.custodyHistory[1].timestamp).to.equal(timestamp);
      expect(resultObj.custodyHistory[1].location).to.equal(location);

      // Verify that putState was called with the correct arguments
      sinon.assert.calledWith(stub.putState, id, sinon.match.any);
    });

    it('should throw an error if the product does not exist', async () => {
      const id = 'PROD001';
      const newHolder = 'Manufacturer B';
      const timestamp = '1626950800000';
      const location = 'Factory 2';

      // Mock the getState method to return null (product not found)
      stub.getState.resolves(Buffer.from(''));

      // Call the function and expect it to throw an error
      try {
        await contract.transferCustody(ctx, id, newHolder, timestamp, location);
        expect.fail('The function did not throw an error');
      } catch (error) {
        expect(error.message).to.include(`Product ${id} does not exist`);
      }
    });
  });

  // Add more tests for other functions...
});