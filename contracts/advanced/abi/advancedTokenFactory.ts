// Frontend copy of AdvancedTokenFactory. Whole-token amounts are scaled once by the factory.
// deployAdvancedToken and createVestingWallet take maxFee in native wei.
// createVestingWallet: startTimestamp 0 means block.timestamp. A past start reverts StartInPast.
// sequencerUptimeFeed is address(0) on L1.
export const advancedTokenFactoryAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "aggregator_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "sequencerUptimeFeed_",
        "type": "address"
      },
      {
        "internalType": "address payable",
        "name": "feeRecipient_",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "baseFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "mintFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "burnFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "distributionFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "pauseFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "transferFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "permitFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "votesFeeUsdWei",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "vestingFeeUsdWei",
            "type": "uint256"
          }
        ],
        "internalType": "struct AdvancedTokenFactory.FeeSchedule",
        "name": "fees",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "token",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "permit",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "votes",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "vesting",
            "type": "address"
          }
        ],
        "internalType": "struct AdvancedTokenFactory.Deployers",
        "name": "deployers",
        "type": "tuple"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "BadDistribution",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DecimalsOutOfRange",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "EnforcedPause",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ExpectedPause",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "required",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "maxFee",
        "type": "uint256"
      }
    ],
    "name": "FeeAboveMax",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "feeUsdWei",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "normalizedPrice",
        "type": "uint256"
      }
    ],
    "name": "FeeRoundsToZero",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "FeeTransferFailed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "required",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "sent",
        "type": "uint256"
      }
    ],
    "name": "InsufficientFee",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidName",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPrice",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSequencerRound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSymbol",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidTimestamp",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "NotAContract",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      }
    ],
    "name": "PermitNameTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PriceOutOfBounds",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PriceTooOld",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RefundFailedBoth",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RenounceWhilePaused",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SequencerDown",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "startedAt",
        "type": "uint256"
      }
    ],
    "name": "SequencerGracePeriod",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "StaleRound",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "startTimestamp",
        "type": "uint64"
      }
    ],
    "name": "StartInPast",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SupplyOverflow",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TaxConfigMismatch",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "option",
        "type": "bytes32"
      }
    ],
    "name": "UnknownOption",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "startTimestamp",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "durationSeconds",
        "type": "uint64"
      }
    ],
    "name": "VestingAlreadyFinished",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroAddress",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "symbol",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "decimals",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalSupply",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "feePaid",
        "type": "uint256"
      }
    ],
    "name": "AdvancedTokenCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "previousFeeUsdWei",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newFeeUsdWei",
        "type": "uint256"
      }
    ],
    "name": "BaseFeeUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "from",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "FeeCollected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousRecipient",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newRecipient",
        "type": "address"
      }
    ],
    "name": "FeeRecipientUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "option",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "previousFeeUsdWei",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newFeeUsdWei",
        "type": "uint256"
      }
    ],
    "name": "OptionFeeUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferStarted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Paused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "fallbackRecipient",
        "type": "address"
      }
    ],
    "name": "RefundFailed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Unpaused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "beneficiary",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "startTimestamp",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "durationSeconds",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "cliffSeconds",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "feePaid",
        "type": "uint256"
      }
    ],
    "name": "VestingWalletCreated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_PRICE_AGE",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_BURN",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_DISTRIBUTION",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_MINT",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_PAUSE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_PERMIT",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_TRANSFER_FEE",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_VESTING",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "OPTION_VOTES",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "SEQUENCER_GRACE_PERIOD",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "acceptOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "baseFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "burnFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "beneficiary",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "startTimestamp",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "durationSeconds",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "cliffSeconds",
        "type": "uint64"
      },
      {
        "internalType": "uint256",
        "name": "maxFee",
        "type": "uint256"
      }
    ],
    "name": "createVestingWallet",
    "outputs": [
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "bool",
            "name": "initialDistribution",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "mint",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "burn",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "pause",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "transferFee",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "permit",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "votes",
            "type": "bool"
          }
        ],
        "internalType": "struct AdvancedTokenFactory.FeatureFlags",
        "name": "flags",
        "type": "tuple"
      }
    ],
    "name": "currentFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentVestingFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "symbol",
            "type": "string"
          },
          {
            "internalType": "uint8",
            "name": "decimals",
            "type": "uint8"
          },
          {
            "internalType": "uint256",
            "name": "initialSupply",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "initialOwner",
            "type": "address"
          }
        ],
        "internalType": "struct AdvancedTokenFactory.TokenConfig",
        "name": "config",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "bool",
            "name": "initialDistribution",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "mint",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "burn",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "pause",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "transferFee",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "permit",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "votes",
            "type": "bool"
          }
        ],
        "internalType": "struct AdvancedTokenFactory.FeatureFlags",
        "name": "flags",
        "type": "tuple"
      },
      {
        "components": [
          {
            "internalType": "address[]",
            "name": "distributionRecipients",
            "type": "address[]"
          },
          {
            "internalType": "uint256[]",
            "name": "distributionAmounts",
            "type": "uint256[]"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "feeRecipient",
                "type": "address"
              },
              {
                "internalType": "uint16",
                "name": "buyFeeBps",
                "type": "uint16"
              },
              {
                "internalType": "uint16",
                "name": "sellFeeBps",
                "type": "uint16"
              }
            ],
            "internalType": "struct AdvancedTokenFactory.TaxConfig",
            "name": "tax",
            "type": "tuple"
          },
          {
            "internalType": "uint256",
            "name": "cap",
            "type": "uint256"
          }
        ],
        "internalType": "struct AdvancedTokenFactory.AdvancedConfig",
        "name": "advanced",
        "type": "tuple"
      },
      {
        "internalType": "uint256",
        "name": "maxFee",
        "type": "uint256"
      }
    ],
    "name": "deployAdvancedToken",
    "outputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "distributionFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "feeRecipient",
    "outputs": [
      {
        "internalType": "address payable",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      }
    ],
    "name": "getNonce",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "mintFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pauseFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pendingOwner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "permitDeployer",
    "outputs": [
      {
        "internalType": "contract PermitDeployer",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "permitFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "priceFeed",
    "outputs": [
      {
        "internalType": "contract AggregatorV3Interface",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sequencerUptimeFeed",
    "outputs": [
      {
        "internalType": "contract AggregatorV3Interface",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newFeeUsdWei",
        "type": "uint256"
      }
    ],
    "name": "setBaseFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address payable",
        "name": "newRecipient",
        "type": "address"
      }
    ],
    "name": "setFeeRecipient",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "option",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "newFeeUsdWei",
        "type": "uint256"
      }
    ],
    "name": "setOptionFee",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "tokenDeployer",
    "outputs": [
      {
        "internalType": "contract TokenDeployer",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "transferFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "vestingDeployer",
    "outputs": [
      {
        "internalType": "contract VestingDeployer",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "vestingFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "votesDeployer",
    "outputs": [
      {
        "internalType": "contract VotesDeployer",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "votesFeeUsdWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
