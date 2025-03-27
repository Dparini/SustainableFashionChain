package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// SmartContract provides functions for managing sustainable fashion supply chain
type SmartContract struct {
	contractapi.Contract
}

// Product represents a sustainable fashion product with lifecycle details
type Product struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Description      string    `json:"description"`
	Manufacturer     string    `json:"manufacturer"`
	ManufactureDate  time.Time `json:"manufactureDate"`
	RawMaterials     []string  `json:"rawMaterials"`
	SustainabilityCertifications []string `json:"sustainabilityCertifications"`
	CarbonFootprint  float64   `json:"carbonFootprint"`
	CurrentOwner     string    `json:"currentOwner"`
	Status           string    `json:"status"` // e.g., "Manufactured", "InTransit", "Retail", "Sold"
	PriceHistory     []Price   `json:"priceHistory"`
	TransactionHistory []Transaction `json:"transactionHistory"`
	EthereumTokenID  string    `json:"ethereumTokenID,omitempty"` // For bridging with Ethereum NFT
}

// Price represents a price point in the product's lifecycle
type Price struct {
	Value     float64   `json:"value"`
	Currency  string    `json:"currency"`
	Timestamp time.Time `json:"timestamp"`
}

// Transaction represents a transfer or status change in the supply chain
type Transaction struct {
	TxID        string    `json:"txId"`
	FromOwner   string    `json:"fromOwner"`
	ToOwner     string    `json:"toOwner"`
	Status      string    `json:"status"`
	Timestamp   time.Time `json:"timestamp"`
	Location    string    `json:"location,omitempty"`
	Description string    `json:"description,omitempty"`
}

// InitLedger adds a base set of products to the ledger
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	products := []Product{
		{
			ID:           "PROD001",
			Name:         "Organic Cotton T-Shirt",
			Description:  "100% Organic cotton, ethically sourced",
			Manufacturer: "EcoFashion Inc.",
			ManufactureDate: time.Now().AddDate(0, -1, 0),
			RawMaterials: []string{"Organic Cotton"},
			SustainabilityCertifications: []string{"GOTS", "Fair Trade"},
			CarbonFootprint: 2.3,
			CurrentOwner:   "EcoFashion Inc.",
			Status:         "Manufactured",
			PriceHistory: []Price{
				{Value: 15.0, Currency: "USD", Timestamp: time.Now().AddDate(0, -1, 0)},
			},
			TransactionHistory: []Transaction{
				{
					TxID:        "INIT001",
					FromOwner:   "",
					ToOwner:     "EcoFashion Inc.",
					Status:      "Manufactured",
					Timestamp:   time.Now().AddDate(0, -1, 0),
					Location:    "Factory A, Milan",
					Description: "Initial production",
				},
			},
		},
	}

	for _, product := range products {
		productJSON, err := json.Marshal(product)
		if err != nil {
			return err
		}

		err = ctx.GetStub().PutState(product.ID, productJSON)
		if err != nil {
			return fmt.Errorf("failed to put to world state: %v", err)
		}
	}

	return nil
}

// CreateProduct issues a new product to the world state with given details
func (s *SmartContract) CreateProduct(ctx contractapi.TransactionContextInterface, id, name, description, manufacturer string,
	rawMaterials []string, sustainabilityCerts []string, carbonFootprint float64) error {

	exists, err := s.ProductExists(ctx, id)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("the product %s already exists", id)
	}

	now := time.Now()
	product := Product{
		ID:               id,
		Name:             name,
		Description:      description,
		Manufacturer:     manufacturer,
		ManufactureDate:  now,
		RawMaterials:     rawMaterials,
		SustainabilityCertifications: sustainabilityCerts,
		CarbonFootprint:  carbonFootprint,
		CurrentOwner:     manufacturer,
		Status:           "Manufactured",
		PriceHistory: []Price{
			{Value: 0.0, Currency: "USD", Timestamp: now},
		},
		TransactionHistory: []Transaction{
			{
				TxID:        ctx.GetStub().GetTxID(),
				FromOwner:   "",
				ToOwner:     manufacturer,
				Status:      "Manufactured",
				Timestamp:   now,
				Description: "Product created",
			},
		},
	}

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, productJSON)
}

// ReadProduct returns the product stored in the world state with given id
func (s *SmartContract) ReadProduct(ctx contractapi.TransactionContextInterface, id string) (*Product, error) {
	productJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %v", err)
	}
	if productJSON == nil {
		return nil, fmt.Errorf("the product %s does not exist", id)
	}

	var product Product
	err = json.Unmarshal(productJSON, &product)
	if err != nil {
		return nil, err
	}

	return &product, nil
}

// UpdateProductStatus updates a product's status in the supply chain
func (s *SmartContract) UpdateProductStatus(ctx contractapi.TransactionContextInterface, id, newStatus, location, description string) error {
	product, err := s.ReadProduct(ctx, id)
	if err != nil {
		return err
	}

	// Add new transaction to history
	newTx := Transaction{
		TxID:        ctx.GetStub().GetTxID(),
		FromOwner:   product.CurrentOwner,
		ToOwner:     product.CurrentOwner,
		Status:      newStatus,
		Timestamp:   time.Now(),
		Location:    location,
		Description: description,
	}

	product.Status = newStatus
	product.TransactionHistory = append(product.TransactionHistory, newTx)

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, productJSON)
}

// TransferProduct changes the owner of a product
func (s *SmartContract) TransferProduct(ctx contractapi.TransactionContextInterface, id, newOwner, location, description string) error {
	product, err := s.ReadProduct(ctx, id)
	if err != nil {
		return err
	}

	oldOwner := product.CurrentOwner
	product.CurrentOwner = newOwner

	// Add transfer to transaction history
	newTx := Transaction{
		TxID:        ctx.GetStub().GetTxID(),
		FromOwner:   oldOwner,
		ToOwner:     newOwner,
		Status:      product.Status,
		Timestamp:   time.Now(),
		Location:    location,
		Description: description,
	}

	product.TransactionHistory = append(product.TransactionHistory, newTx)

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, productJSON)
}

// UpdatePrice adds a new price point to a product
func (s *SmartContract) UpdatePrice(ctx contractapi.TransactionContextInterface, id string, newPrice float64, currency string) error {
	product, err := s.ReadProduct(ctx, id)
	if err != nil {
		return err
	}

	// Add new price to history
	newPricePoint := Price{
		Value:     newPrice,
		Currency:  currency,
		Timestamp: time.Now(),
	}

	product.PriceHistory = append(product.PriceHistory, newPricePoint)

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, productJSON)
}

// LinkWithEthereum associates the product with an Ethereum token ID
func (s *SmartContract) LinkWithEthereum(ctx contractapi.TransactionContextInterface, id string, ethereumTokenID string) error {
	product, err := s.ReadProduct(ctx, id)
	if err != nil {
		return err
	}

	product.EthereumTokenID = ethereumTokenID

	productJSON, err := json.Marshal(product)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(id, productJSON)
}

// GetAllProducts returns all products found in world state
func (s *SmartContract) GetAllProducts(ctx contractapi.TransactionContextInterface) ([]*Product, error) {
	// Get iterator for all products
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var products []*Product
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var product Product
		err = json.Unmarshal(queryResponse.Value, &product)
		if err != nil {
			return nil, err
		}
		products = append(products, &product)
	}

	return products, nil
}

// QueryProductsByManufacturer retrieves all products manufactured by a specific manufacturer
func (s *SmartContract) QueryProductsByManufacturer(ctx contractapi.TransactionContextInterface, manufacturer string) ([]*Product, error) {
	allProducts, err := s.GetAllProducts(ctx)
	if err != nil {
		return nil, err
	}

	var manufacturerProducts []*Product
	for _, product := range allProducts {
		if product.Manufacturer == manufacturer {
			manufacturerProducts = append(manufacturerProducts, product)
		}
	}

	return manufacturerProducts, nil
}

// QueryProductsByCertification retrieves all products with a specific sustainability certification
func (s *SmartContract) QueryProductsByCertification(ctx contractapi.TransactionContextInterface, certification string) ([]*Product, error) {
	allProducts, err := s.GetAllProducts(ctx)
	if err != nil {
		return nil, err
	}

	var certifiedProducts []*Product
	for _, product := range allProducts {
		for _, cert := range product.SustainabilityCertifications {
			if cert == certification {
				certifiedProducts = append(certifiedProducts, product)
				break
			}
		}
	}

	return certifiedProducts, nil
}

// ProductExists returns true when product with given ID exists in world state
func (s *SmartContract) ProductExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	productJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %v", err)
	}

	return productJSON != nil, nil
}

// main function starts the chaincode on the Fabric peer
func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		fmt.Printf("Error creating sustainable fashion supply chain chaincode: %v", err)
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting sustainable fashion supply chain chaincode: %v", err)
	}
}